import * as THREE from 'three';
import { vertexShader } from '../shaders/vertex';
import { asciiFragmentShader as fragmentShader } from '../shaders/ascii.frag';
import { composeFragmentShader } from '../shaders/compose.frag';
import { PALETTES, hexToVec3 } from '../data/palettes';
import { FACTORY_PRESETS } from '../data/presets';
import type { PresetState } from '../data/presets';
import { UNITY_HLSL } from '../exports/unity-hlsl';
import { WEBGL_EXPORT } from '../exports/webgl-widget';

export function initAsciiFilter(): void {
    // DOM refs
    const videoEl = document.getElementById('media-video') as HTMLVideoElement;
    const imageEl = document.getElementById('media-image') as HTMLImageElement;
    const fileInput = document.getElementById('media-upload') as HTMLInputElement;
    const canvas = document.getElementById('app-canvas') as HTMLCanvasElement;
    const statusText = document.getElementById('status-text') as HTMLParagraphElement;
    
    const modeWebBtn = document.getElementById('mode-web')!;
    const modeEngineBtn = document.getElementById('mode-engine')!;
    const webFeaturesBlock = document.getElementById('web-features')!;
    const btnExportUnity = document.getElementById('btn-export-unity')!;
    const btnExportWeb = document.getElementById('btn-export-web')!;
    
    const slBlackout = document.getElementById('slider-blackout') as HTMLInputElement;
    const slVibrancy = document.getElementById('slider-vibrancy') as HTMLInputElement;
    const slDensity = document.getElementById('slider-density') as HTMLInputElement;
    const slSteps = document.getElementById('slider-steps') as HTMLInputElement;
    const slSat = document.getElementById('slider-sat') as HTMLInputElement;
    const slFade = document.getElementById('slider-fade') as HTMLInputElement;
    const slFontAspect = document.getElementById('slider-fontaspect') as HTMLInputElement;
    const slEdgeStrength = document.getElementById('slider-edgestrength') as HTMLInputElement;
    const slChroma = document.getElementById('slider-chroma') as HTMLInputElement;
    const slDepthStrength = document.getElementById('slider-depthstrength') as HTMLInputElement;
    const slFlowSpeed = document.getElementById('slider-flowspeed') as HTMLInputElement;
    const slFlowStrength = document.getElementById('slider-flowstrength') as HTMLInputElement;
    const slTemporalBlend = document.getElementById('slider-temporalblend') as HTMLInputElement;
    const inputCharRamp = document.getElementById('input-charramp') as HTMLInputElement;
    const togEyeSaver = document.getElementById('toggle-eyesaver') as HTMLInputElement;
    const togFluid = document.getElementById('toggle-fluid') as HTMLInputElement;
    const togAudio = document.getElementById('toggle-audio') as HTMLInputElement;
    const togEdge = document.getElementById('toggle-edge') as HTMLInputElement;
    const togEdgeContinuous = document.getElementById('toggle-edge-continuous') as HTMLInputElement;
    const togDither = document.getElementById('toggle-dither') as HTMLInputElement;
    const togScanlines = document.getElementById('toggle-scanlines') as HTMLInputElement;
    const togCrisp = document.getElementById('toggle-crisp') as HTMLInputElement;
    const togDepth = document.getElementById('toggle-depth') as HTMLInputElement;
    const togMultilayer = document.getElementById('toggle-multilayer') as HTMLInputElement;
    const togPalette = document.getElementById('toggle-palette') as HTMLInputElement;
    const selectPalette = document.getElementById('select-palette') as HTMLSelectElement;
    const togFlow = document.getElementById('toggle-flow') as HTMLInputElement;
    const togTemporal = document.getElementById('toggle-temporal') as HTMLInputElement;

    // floating tooltip on hover over the (i) icons
    const tooltipEl = document.getElementById('tooltip')!;
    const tooltipBody = document.getElementById('tooltip-body')!;
    const panelEl = document.getElementById('ui-panel')!;
    function wireTooltips() {
        document.querySelectorAll('[data-tip]').forEach((el) => {
            if ((el as HTMLElement).dataset.tipWired) return;
            (el as HTMLElement).dataset.tipWired = '1';
            el.addEventListener('mouseenter', () => {
                tooltipBody.textContent = (el as HTMLElement).dataset.tip || '';
                const rect = (el as HTMLElement).getBoundingClientRect();
                const panelRect = panelEl.getBoundingClientRect();
                let left = panelRect.right + 16;
                if (left + 276 > window.innerWidth) left = Math.max(8, panelRect.left - 276);
                let top = Math.min(Math.max(rect.top - 10, 8), window.innerHeight - 220);
                tooltipEl.style.left = left + 'px';
                tooltipEl.style.top = top + 'px';
                tooltipEl.style.display = 'block';
            });
            el.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
        });
    }
    wireTooltips();

    // background color swatches
    const swatches = document.querySelectorAll('.color-swatch:not(.custom-picker-wrap)');
    const customBgInput = document.getElementById('custom-bg-input') as HTMLInputElement;
    let currentBgHex = '#000000';

    function updateBgColor(hex: string, activeElement: HTMLElement | null) {
        currentBgHex = hex;
        uniforms.u_bg_color.value.set(hex);
        document.body.style.backgroundColor = hex;
        if(customBgInput.parentElement) customBgInput.parentElement.style.backgroundColor = hex;
        document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('active'));
        if (activeElement) activeElement.classList.add('active');
    }

    swatches.forEach(swatch => {
        swatch.addEventListener('click', () => updateBgColor((swatch as HTMLElement).dataset.color!, swatch as HTMLElement));
    });
    customBgInput.addEventListener('input', (e) => updateBgColor((e.target as HTMLInputElement).value, customBgInput.parentElement));

    // Web App / Game Engine mode toggle
    modeWebBtn.addEventListener('click', () => {
        modeWebBtn.classList.add('active'); modeEngineBtn.classList.remove('active');
        webFeaturesBlock.style.display = 'block'; btnExportUnity.style.display = 'none';
        btnExportWeb.style.display = 'block'; uniforms.u_is_web_mode.value = 1.0;
    });

    modeEngineBtn.addEventListener('click', () => {
        modeEngineBtn.classList.add('active'); modeWebBtn.classList.remove('active');
        webFeaturesBlock.style.display = 'none'; btnExportUnity.style.display = 'block';
        btnExportWeb.style.display = 'none'; uniforms.u_is_web_mode.value = 0.0;
    });

    // audio reactivity, pulls levels from the video or the mic
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let dataArray: Uint8Array | null = null;
    let videoSourceNode: MediaElementAudioSourceNode | null = null;
    let micSourceNode: MediaStreamAudioSourceNode | null = null;
    let isAudioActive = false;

    async function toggleAudioReactivity(enable: boolean) {
        if (!enable) {
            isAudioActive = false; uniforms.u_audio_level.value = 0.0; videoEl.muted = true; return;
        }
        if (!audioContext) {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            analyser = audioContext.createAnalyser(); analyser.fftSize = 256;
            dataArray = new Uint8Array(analyser.frequencyBinCount);
        }
        if (audioContext.state === 'suspended') await audioContext.resume();
        if (micSourceNode) micSourceNode.disconnect();
        if (analyser) analyser.disconnect(); 

        if (videoEl.srcObject || (videoEl.src && !videoEl.paused)) {
            videoEl.muted = false; 
            if (!videoSourceNode) videoSourceNode = audioContext.createMediaElementSource(videoEl);
            videoSourceNode.connect(analyser!); analyser!.connect(audioContext.destination); 
            isAudioActive = true;
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                micSourceNode = audioContext.createMediaStreamSource(stream);
                micSourceNode.connect(analyser!); isAudioActive = true;
            } catch (err) {
                console.error("Mic error", err); togAudio.checked = false;
                alert("No video playing, and Microphone access was denied.");
            }
        }
    }
    togAudio.addEventListener('change', (e) => toggleAudioReactivity((e.target as HTMLInputElement).checked));

    // bakes the glyph atlas textures the shader reads from
    const ATLAS_CELL_H = 96;
    let currentCharRamp = " .:-=+*#%@";
    let currentFontAspect = 0.55;

    const atlasCanvas = document.createElement('canvas');
    const atlasCtx = atlasCanvas.getContext('2d')!;
    const atlasTexture = new THREE.CanvasTexture(atlasCanvas);
    atlasTexture.generateMipmaps = false;

    const edgeAtlasCanvas = document.createElement('canvas');
    const edgeAtlasCtx = edgeAtlasCanvas.getContext('2d')!;
    const edgeAtlasTexture = new THREE.CanvasTexture(edgeAtlasCanvas);
    edgeAtlasTexture.generateMipmaps = false;
    const EDGE_CHARS = "-/|\\";

    const strokeCanvas = document.createElement('canvas');
    const strokeCtx = strokeCanvas.getContext('2d')!;
    const strokeTexture = new THREE.CanvasTexture(strokeCanvas);
    strokeTexture.generateMipmaps = false;
    strokeTexture.minFilter = THREE.LinearFilter;
    strokeTexture.magFilter = THREE.LinearFilter;

    function applyFilterMode(crisp: boolean) {
        const min = crisp ? THREE.LinearFilter : THREE.NearestFilter;
        atlasTexture.minFilter = min; atlasTexture.magFilter = min; atlasTexture.needsUpdate = true;
        edgeAtlasTexture.minFilter = min; edgeAtlasTexture.magFilter = min; edgeAtlasTexture.needsUpdate = true;
    }

    function drawGlyphsToCanvas(cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D, chars: string, cellW: number, cellH: number) {
        cv.width = chars.length * cellW; cv.height = cellH;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.floor(cellH * 0.8)}px 'Courier New', monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], i * cellW + cellW / 2, cellH / 2 + cellH * 0.03);
        }
    }

    function drawStrokeCanvas(cellW: number, cellH: number) {
        strokeCanvas.width = cellW; strokeCanvas.height = cellH;
        strokeCtx.fillStyle = '#000'; strokeCtx.fillRect(0, 0, cellW, cellH);
        strokeCtx.fillStyle = '#fff';
        const lineW = Math.max(2, cellH * 0.09);
        strokeCtx.fillRect(cellW * 0.05, cellH / 2 - lineW / 2, cellW * 0.9, lineW);
    }

    function rebuildAtlases(chars: string, fontAspect: number) {
        const ramp = chars.length >= 2 ? chars : " .:-=+*#%@";
        currentCharRamp = ramp;
        currentFontAspect = fontAspect;
        const cellW = Math.max(8, Math.round(ATLAS_CELL_H * fontAspect));

        drawGlyphsToCanvas(atlasCanvas, atlasCtx, ramp, cellW, ATLAS_CELL_H);
        atlasTexture.needsUpdate = true;

        drawGlyphsToCanvas(edgeAtlasCanvas, edgeAtlasCtx, EDGE_CHARS, cellW, ATLAS_CELL_H);
        edgeAtlasTexture.needsUpdate = true;

        drawStrokeCanvas(cellW, ATLAS_CELL_H);
        strokeTexture.needsUpdate = true;

        if (uniforms) {
            uniforms.u_chars_count.value = ramp.length;
            uniforms.u_font_aspect.value = fontAspect;
        }
    }

    function applyPalette(name: string) {
        const hexList = PALETTES[name] || PALETTES.cga;
        const flat: number[] = [];
        for (let i = 0; i < 16; i++) {
            const hex = hexList[i % hexList.length];
            const [r, g, b] = i < hexList.length ? hexToVec3(hex) : [0, 0, 0];
            flat.push(r, g, b);
        }
        uniforms.u_palette.value = flat;
        uniforms.u_palette_count.value = hexList.length;
    }

    // three.js scene / camera / renderer
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    const clock = new THREE.Clock();

    let targetZoom = 1.0; 
    let currentZoom = 1.0;
    let targetMouse = new THREE.Vector2(0, 0); 
    let currentMouse = new THREE.Vector2(0, 0);
    let targetActualMouse = new THREE.Vector2(0.5, 0.5); 
    let actualMouse = new THREE.Vector2(0.5, 0.5);

    const uniforms: Record<string, { value: any }> = {
        tDiffuse: { value: new THREE.Texture() },
        u_atlas: { value: atlasTexture },
        u_edge_atlas: { value: edgeAtlasTexture },
        u_stroke_atlas: { value: strokeTexture },
        u_chars_count: { value: 10.0 },
        u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        u_media_resolution: { value: new THREE.Vector2(1, 1) },
        u_density: { value: 120.0 },
        u_color_steps: { value: 4.0 },
        u_saturation: { value: 1.0 },
        u_zoom: { value: 1.0 },
        u_mouse_offset: { value: new THREE.Vector2(0, 0) },
        u_mouse_pos: { value: new THREE.Vector2(0.5, 0.5) },
        u_bg_color: { value: new THREE.Color(0x000000) },
        u_blackout_limit: { value: 1.0 },
        u_vibrancy: { value: 1.0 },
        u_eye_saver: { value: 0.0 },
        u_edge_fade: { value: 0.0 },
        u_is_web_mode: { value: 1.0 },
        u_fluid: { value: 0.0 },
        u_audio_level: { value: 0.0 },
        u_font_aspect: { value: 0.55 },
        u_edge_detect: { value: 0.0 },
        u_edge_continuous: { value: 0.0 },
        u_edge_strength: { value: 1.0 },
        u_dither: { value: 1.0 },
        u_chroma: { value: 0.0 },
        u_scanlines: { value: 0.0 },
        u_crisp: { value: 0.0 },
        u_depth_extrude: { value: 0.0 },
        u_depth_strength: { value: 1.0 },
        u_multilayer: { value: 0.0 },
        u_palette_mode: { value: 0.0 },
        u_palette: { value: new Array(48).fill(0) },
        u_palette_count: { value: 4 },
        u_flow: { value: 0.0 },
        u_flow_speed: { value: 0.3 },
        u_flow_strength: { value: 1.0 },
        u_time: { value: 0.0 }
    };

    rebuildAtlases(currentCharRamp, currentFontAspect);
    applyPalette('cga');

    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

    // ping-pong blend for temporal trails
    const composeScene = new THREE.Scene();
    const composeUniforms = {
        u_current: { value: null as THREE.Texture | null },
        u_prev: { value: null as THREE.Texture | null },
        u_blend: { value: 0.0 }
    };
    const composeMaterial = new THREE.ShaderMaterial({
        uniforms: composeUniforms,
        vertexShader,
        fragmentShader: composeFragmentShader
    });
    composeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), composeMaterial));

    function makeRT(w: number, h: number) {
        return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
            minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat
        });
    }
    let sceneRT = makeRT(window.innerWidth, window.innerHeight);
    let rtA = makeRT(window.innerWidth, window.innerHeight);
    let rtB = makeRT(window.innerWidth, window.innerHeight);
    let readRT = rtA, writeRT = rtB;
    let temporalOn = false;

    // wire up sliders/toggles

    // range input -> uniform + label text
    function bindSlider(el: HTMLInputElement, uniform: { value: number }, labelId: string) {
        el.addEventListener('input', (e) => {
            const val = (e.target as HTMLInputElement).value;
            uniform.value = parseFloat(val);
            document.getElementById(labelId)!.innerText = val;
        });
    }

    // checkbox -> callback
    function bindToggle(el: HTMLInputElement, apply: (checked: boolean) => void) {
        el.addEventListener('change', (e) => apply((e.target as HTMLInputElement).checked));
    }

    bindSlider(slBlackout, uniforms.u_blackout_limit, 'val-blackout');
    bindSlider(slVibrancy, uniforms.u_vibrancy, 'val-vibrancy');
    bindSlider(slDensity, uniforms.u_density, 'val-density');
    bindSlider(slSteps, uniforms.u_color_steps, 'val-steps');
    bindSlider(slSat, uniforms.u_saturation, 'val-sat');
    bindSlider(slFade, uniforms.u_edge_fade, 'val-fade');
    bindSlider(slEdgeStrength, uniforms.u_edge_strength, 'val-edgestrength');
    bindSlider(slChroma, uniforms.u_chroma, 'val-chroma');
    bindSlider(slDepthStrength, uniforms.u_depth_strength, 'val-depthstrength');
    bindSlider(slFlowSpeed, uniforms.u_flow_speed, 'val-flowspeed');
    bindSlider(slFlowStrength, uniforms.u_flow_strength, 'val-flowstrength');

    // only actually blends when trails are on
    slTemporalBlend.addEventListener('input', (e) => {
        const val = (e.target as HTMLInputElement).value;
        composeUniforms.u_blend.value = temporalOn ? parseFloat(val) : 0.0;
        document.getElementById('val-temporalblend')!.innerText = val;
    });

    // these two need the atlas rebuilt
    slFontAspect.addEventListener('input', (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        document.getElementById('val-fontaspect')!.innerText = val.toFixed(2);
        rebuildAtlases(currentCharRamp, val);
    });

    inputCharRamp.addEventListener('input', (e) => {
        const val = (e.target as HTMLInputElement).value;
        if (val.length >= 2) rebuildAtlases(val, currentFontAspect);
    });

    bindToggle(togEyeSaver, (v) => { uniforms.u_eye_saver.value = v ? 1.0 : 0.0; });
    bindToggle(togFluid, (v) => { uniforms.u_fluid.value = v ? 1.0 : 0.0; });
    bindToggle(togEdge, (v) => { uniforms.u_edge_detect.value = v ? 1.0 : 0.0; });
    bindToggle(togEdgeContinuous, (v) => { uniforms.u_edge_continuous.value = v ? 1.0 : 0.0; });
    bindToggle(togDither, (v) => { uniforms.u_dither.value = v ? 1.0 : 0.0; });
    bindToggle(togScanlines, (v) => { uniforms.u_scanlines.value = v ? 1.0 : 0.0; });
    bindToggle(togCrisp, (v) => { uniforms.u_crisp.value = v ? 1.0 : 0.0; applyFilterMode(v); });
    bindToggle(togDepth, (v) => { uniforms.u_depth_extrude.value = v ? 1.0 : 0.0; });
    bindToggle(togMultilayer, (v) => { uniforms.u_multilayer.value = v ? 1.0 : 0.0; });
    bindToggle(togPalette, (v) => { uniforms.u_palette_mode.value = v ? 1.0 : 0.0; });
    bindToggle(togFlow, (v) => { uniforms.u_flow.value = v ? 1.0 : 0.0; });

    selectPalette.addEventListener('change', (e) => { applyPalette((e.target as HTMLSelectElement).value); });

    // keeps the on/off state the blend above checks
    togTemporal.addEventListener('change', (e) => {
        temporalOn = (e.target as HTMLInputElement).checked;
        composeUniforms.u_blend.value = temporalOn ? parseFloat(slTemporalBlend.value) : 0.0;
    });

    document.getElementById('btn-zoom-in')!.addEventListener('click', () => { targetZoom *= 1.2; });
    document.getElementById('btn-zoom-out')!.addEventListener('click', () => { targetZoom = Math.max(0.1, targetZoom / 1.2); });

    // mouse/touch -> pan + pinch zoom
    function isOverUi(target: EventTarget | null) {
        const el = target as HTMLElement;
        return !!(el && (el.closest('.ui-panel') || el.closest('.bg-selector') || el.closest('#export-modal')));
    }

    window.addEventListener('mousemove', (e) => {
        targetActualMouse.x = e.clientX / window.innerWidth;
        targetActualMouse.y = 1.0 - (e.clientY / window.innerHeight);
        if (isOverUi(e.target)) return;
        targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        targetMouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    });

    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    function touchToMouseLike(t: Touch) {
        targetActualMouse.x = t.clientX / window.innerWidth;
        targetActualMouse.y = 1.0 - (t.clientY / window.innerHeight);
        targetMouse.x = (t.clientX / window.innerWidth) * 2 - 1;
        targetMouse.y = (t.clientY / window.innerHeight) * 2 - 1;
    }
    window.addEventListener('touchstart', (e) => {
        if (isOverUi(e.target)) return;
        if (e.touches.length === 1) touchToMouseLike(e.touches[0]);
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchStartDist = Math.hypot(dx, dy);
            pinchStartZoom = targetZoom;
        }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
        if (isOverUi(e.target)) return;
        if (e.touches.length === 1) touchToMouseLike(e.touches[0]);
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            if (pinchStartDist > 0) targetZoom = Math.max(0.1, pinchStartZoom * (dist / pinchStartDist));
        }
    }, { passive: true });

    // upload or webcam -> render source
    function bindVideoTexture(onReady?: () => void) {
        const videoTex = new THREE.VideoTexture(videoEl);
        videoTex.minFilter = THREE.LinearFilter;
        videoTex.magFilter = THREE.LinearFilter;
        uniforms.tDiffuse.value = videoTex;
        uniforms.u_media_resolution.value.set(videoEl.videoWidth || 1, videoEl.videoHeight || 1);
        targetZoom = 1.0;
        if (onReady) onReady();
    }

    fileInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;
        statusText.innerText = "Processing...";
        const url = URL.createObjectURL(file);

        if (file.type.startsWith('video/')) {
            videoEl.srcObject = null;
            videoEl.src = url;
            videoEl.onloadeddata = () => {
                videoEl.play();
                bindVideoTexture(() => { statusText.innerText = "Playing Video"; });
                if (togAudio.checked) toggleAudioReactivity(true);
            };
        } else if (file.type.startsWith('image/')) {
            imageEl.src = url;
            imageEl.onload = () => {
                const imgTex = new THREE.Texture(imageEl);
                imgTex.needsUpdate = true;
                imgTex.minFilter = THREE.LinearFilter; 
                imgTex.magFilter = THREE.LinearFilter;
                uniforms.tDiffuse.value = imgTex;
                uniforms.u_media_resolution.value.set(imageEl.naturalWidth, imageEl.naturalHeight);
                targetZoom = 1.0; statusText.innerText = "Rendering Image";
                if (togAudio.checked) toggleAudioReactivity(true);
            };
        }
    });

    document.getElementById('btn-webcam')!.addEventListener('click', async () => {
        try {
            statusText.innerText = "Requesting camera...";
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: togAudio.checked });
            videoEl.src = '';
            videoEl.srcObject = stream;
            videoEl.onloadedmetadata = () => {
                videoEl.play();
                bindVideoTexture(() => { statusText.innerText = "Live Webcam"; });
                if (togAudio.checked) toggleAudioReactivity(true);
            };
        } catch (err) {
            statusText.innerText = "Awaiting media...";
            alert("Webcam access was denied or unavailable.");
        }
    });

    // canvas -> WebM recording
    let mediaRecorder: MediaRecorder | null = null;
    let recordedChunks: Blob[] = [];
    const btnRecord = document.getElementById('btn-record')!;
    const recIndicator = document.getElementById('rec-indicator')!;
    btnRecord.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            return;
        }
        let stream: MediaStream;
        try {
            stream = canvas.captureStream(30);
        } catch (err) {
            alert("This browser doesn't support canvas recording.");
            return;
        }
        recordedChunks = [];
        let options: MediaRecorderOptions = { mimeType: 'video/webm;codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType!)) options = { mimeType: 'video/webm' };
        try {
            mediaRecorder = new MediaRecorder(stream, options);
        } catch (err) {
            mediaRecorder = new MediaRecorder(stream);
        }
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = 'ascii-recording.webm'; link.href = url; link.click();
            btnRecord.innerText = '● Record WebM';
            recIndicator.classList.remove('active');
        };
        mediaRecorder.start();
        btnRecord.innerText = '■ Stop Recording';
        recIndicator.classList.add('active');
    });

    // Unity/WebGL export popups
    const modalOverlay = document.getElementById('modal-overlay')!;
    const exportModal = document.getElementById('export-modal')!;
    const unityCodeArea = document.getElementById('unity-code') as HTMLTextAreaElement;
    const modalTitle = document.getElementById('modal-title')!;
    const modalDesc = document.getElementById('modal-desc')!;

    document.getElementById('btn-download-atlas')!.addEventListener('click', () => {
        const link = document.createElement('a'); link.download = 'ascii-font-atlas.png';
        link.href = atlasCanvas.toDataURL('image/png'); link.click();
    });

    document.getElementById('btn-download')!.addEventListener('click', () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
        const ctx = tempCanvas.getContext('2d')!;
        ctx.fillStyle = currentBgHex;
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        ctx.drawImage(canvas, 0, 0);
        const link = document.createElement('a'); link.download = 'ascii-export.png';
        link.href = tempCanvas.toDataURL('image/png'); link.click();
    });

    btnExportUnity.addEventListener('click', () => {
        modalTitle.innerText = "Unity HLSL Export";
        modalDesc.innerHTML = "1. Download the Font Atlas.<br/>2. Create a new Shader asset, paste this in, and assign the atlas to Char Atlas on the material.";
        unityCodeArea.value = UNITY_HLSL;
        modalOverlay.classList.add('visible'); exportModal.classList.add('visible');
    });

    btnExportWeb.addEventListener('click', () => {
        modalTitle.innerText = "WebGL Component Export";
        modalDesc.innerHTML = "1. Download the Font Atlas.<br/>2. Drop this vanilla-JS class into any project: no three.js required.";
        unityCodeArea.value = WEBGL_EXPORT;
        modalOverlay.classList.add('visible'); exportModal.classList.add('visible');
    });

    document.getElementById('btn-close-modal')!.addEventListener('click', () => {
        modalOverlay.classList.remove('visible'); exportModal.classList.remove('visible');
    });

    // preset save/load/import/export
    const LS_KEY = 'ascii-filter-presets-v1';

    function loadUserPresets(): Record<string, PresetState> {
        try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
    }
    function saveUserPresets(p: Record<string, PresetState>) {
        localStorage.setItem(LS_KEY, JSON.stringify(p));
    }

    const selectPreset = document.getElementById('select-preset') as HTMLSelectElement;
    function refreshPresetList() {
        selectPreset.innerHTML = '';
        const factoryGroup = document.createElement('optgroup'); factoryGroup.label = 'Factory';
        Object.keys(FACTORY_PRESETS).forEach(name => {
            const opt = document.createElement('option'); opt.value = 'f:' + name; opt.innerText = name;
            factoryGroup.appendChild(opt);
        });
        selectPreset.appendChild(factoryGroup);

        const userPresets = loadUserPresets();
        const userNames = Object.keys(userPresets);
        if (userNames.length) {
            const userGroup = document.createElement('optgroup'); userGroup.label = 'My Presets';
            userNames.forEach(name => {
                const opt = document.createElement('option'); opt.value = 'u:' + name; opt.innerText = name;
                userGroup.appendChild(opt);
            });
            selectPreset.appendChild(userGroup);
        }
    }
    refreshPresetList();

    function setVal(el: HTMLInputElement | null, value: any) {
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!value; else el.value = String(value);
        el.dispatchEvent(new Event(el.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
    }

    function collectState(): PresetState {
        return {
            charRamp: currentCharRamp, fontAspect: currentFontAspect,
            density: parseFloat(slDensity.value), colorSteps: parseFloat(slSteps.value),
            saturation: parseFloat(slSat.value), blackout: parseFloat(slBlackout.value),
            vibrancy: parseFloat(slVibrancy.value), eyeSaver: togEyeSaver.checked,
            fade: parseFloat(slFade.value), fluid: togFluid.checked,
            edgeDetect: togEdge.checked, edgeStrength: parseFloat(slEdgeStrength.value),
            edgeContinuous: togEdgeContinuous.checked, dither: togDither.checked,
            chroma: parseFloat(slChroma.value), scanlines: togScanlines.checked,
            crisp: togCrisp.checked, depthExtrude: togDepth.checked,
            depthStrength: parseFloat(slDepthStrength.value), multilayer: togMultilayer.checked,
            paletteMode: togPalette.checked, paletteName: selectPalette.value,
            flow: togFlow.checked, flowSpeed: parseFloat(slFlowSpeed.value),
            flowStrength: parseFloat(slFlowStrength.value), temporalOn: togTemporal.checked,
            temporalBlend: parseFloat(slTemporalBlend.value), bgHex: currentBgHex
        };
    }

    function applyState(s: PresetState) {
        if (s.charRamp) { inputCharRamp.value = s.charRamp; }
        rebuildAtlases(s.charRamp || currentCharRamp, s.fontAspect ?? currentFontAspect);
        document.getElementById('val-fontaspect')!.innerText = (s.fontAspect ?? currentFontAspect).toFixed(2);
        setVal(slDensity, s.density ?? 120); setVal(slSteps, s.colorSteps ?? 4);
        setVal(slSat, s.saturation ?? 1); setVal(slBlackout, s.blackout ?? 1);
        setVal(slVibrancy, s.vibrancy ?? 1); setVal(togEyeSaver, !!s.eyeSaver);
        setVal(slFade, s.fade ?? 0); setVal(togFluid, !!s.fluid);
        setVal(togEdge, !!s.edgeDetect); setVal(slEdgeStrength, s.edgeStrength ?? 1);
        setVal(togEdgeContinuous, !!s.edgeContinuous); setVal(togDither, s.dither !== false);
        setVal(slChroma, s.chroma ?? 0); setVal(togScanlines, !!s.scanlines);
        setVal(togCrisp, !!s.crisp); setVal(togDepth, !!s.depthExtrude);
        setVal(slDepthStrength, s.depthStrength ?? 1); setVal(togMultilayer, !!s.multilayer);
        setVal(togPalette, !!s.paletteMode);
        if (s.paletteName) { selectPalette.value = s.paletteName; applyPalette(s.paletteName); }
        setVal(togFlow, !!s.flow); setVal(slFlowSpeed, s.flowSpeed ?? 0.3);
        setVal(slFlowStrength, s.flowStrength ?? 1); setVal(togTemporal, !!s.temporalOn);
        setVal(slTemporalBlend, s.temporalBlend ?? 0.85);
        if (s.bgHex) updateBgColor(s.bgHex, null);
        wireTooltips();
    }

    document.getElementById('btn-preset-load')!.addEventListener('click', () => {
        const val = selectPreset.value;
        if (!val) return;
        const [kind, name] = [val.slice(0, 2), val.slice(2)];
        const state = kind === 'f:' ? FACTORY_PRESETS[name] : loadUserPresets()[name];
        if (state) applyState(state);
    });

    document.getElementById('btn-preset-save')!.addEventListener('click', () => {
        const name = prompt('Preset name?');
        if (!name) return;
        const presets = loadUserPresets();
        presets[name] = collectState();
        saveUserPresets(presets);
        refreshPresetList();
        selectPreset.value = 'u:' + name;
    });

    document.getElementById('btn-preset-delete')!.addEventListener('click', () => {
        const val = selectPreset.value;
        if (!val.startsWith('u:')) { alert('Only custom presets can be deleted.'); return; }
        const name = val.slice(2);
        const presets = loadUserPresets();
        delete presets[name];
        saveUserPresets(presets);
        refreshPresetList();
    });

    document.getElementById('btn-preset-export')!.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(collectState(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.download = 'ascii-filter-preset.json'; link.href = url; link.click();
    });

    (document.getElementById('input-preset-import') as HTMLInputElement).addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const state = JSON.parse(reader.result as string);
                applyState(state);
            } catch (err) {
                alert('Invalid preset file.');
            }
        };
        reader.readAsText(file);
    });

    // main render loop
    function animate() {
        requestAnimationFrame(animate);
        
        if (isAudioActive && analyser && dataArray) {
            analyser.getByteFrequencyData(dataArray as any);
            let sum = 0;
            for(let i = 0; i < 10; i++) sum += dataArray[i];
            let targetAudioLevel = (sum / 10.0) / 255.0; 
            uniforms.u_audio_level.value += (targetAudioLevel - uniforms.u_audio_level.value) * 0.15;
        }

        actualMouse.lerp(targetActualMouse, 0.1);
        uniforms.u_mouse_pos.value.copy(actualMouse);

        currentMouse.lerp(targetMouse, 0.05);
        currentZoom += (targetZoom - currentZoom) * 0.1;
        uniforms.u_mouse_offset.value.copy(currentMouse);
        uniforms.u_zoom.value = currentZoom;
        uniforms.u_time.value = clock.getElapsedTime();

        renderer.setRenderTarget(sceneRT);
        renderer.render(scene, camera);

        composeUniforms.u_current.value = sceneRT.texture;
        composeUniforms.u_prev.value = readRT.texture;

        renderer.setRenderTarget(writeRT);
        renderer.render(composeScene, camera);

        renderer.setRenderTarget(null);
        renderer.render(composeScene, camera);

        const tmp = readRT; readRT = writeRT; writeRT = tmp;
    }

    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
        sceneRT.setSize(window.innerWidth, window.innerHeight);
        rtA.setSize(window.innerWidth, window.innerHeight);
        rtB.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
}
