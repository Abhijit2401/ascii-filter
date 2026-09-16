export const asciiFragmentShader = `
uniform sampler2D tDiffuse;
uniform sampler2D u_atlas;
uniform sampler2D u_edge_atlas;
uniform sampler2D u_stroke_atlas;
uniform float u_chars_count;
uniform vec2 u_resolution;
uniform vec2 u_media_resolution;
uniform float u_density;
uniform float u_color_steps;
uniform float u_saturation;
uniform float u_zoom;
uniform vec2 u_mouse_offset;
uniform vec2 u_mouse_pos;
uniform vec3 u_bg_color;
uniform float u_blackout_limit;
uniform float u_vibrancy;
uniform float u_eye_saver;
uniform float u_edge_fade;
uniform float u_is_web_mode;
uniform float u_fluid;
uniform float u_audio_level;
uniform float u_font_aspect;
uniform float u_edge_detect;
uniform float u_edge_continuous;
uniform float u_edge_strength;
uniform float u_dither;
uniform float u_chroma;
uniform float u_scanlines;
uniform float u_crisp;
uniform float u_depth_extrude;
uniform float u_depth_strength;
uniform float u_multilayer;
uniform float u_palette_mode;
uniform vec3 u_palette[16];
uniform float u_palette_count;
uniform float u_flow;
uniform float u_flow_speed;
uniform float u_flow_strength;
uniform float u_time;
varying vec2 vUv;

const float PI = 3.14159265;

float lumOf(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float lumAt(vec2 uv) { return lumOf(texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb); }

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float valueNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash(i); float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)); float dd = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (dd - b) * u.x * u.y;
}

// 4x4 Bayer dither threshold for a grid cell
float bayer4x4(vec2 cellPos) {
    float x = mod(floor(cellPos.x), 4.0);
    float y = mod(floor(cellPos.y), 4.0);
    float idx = x + y * 4.0;
    if (idx < 0.5) return 0.0 / 16.0;
    if (idx < 1.5) return 8.0 / 16.0;
    if (idx < 2.5) return 2.0 / 16.0;
    if (idx < 3.5) return 10.0 / 16.0;
    if (idx < 4.5) return 12.0 / 16.0;
    if (idx < 5.5) return 4.0 / 16.0;
    if (idx < 6.5) return 14.0 / 16.0;
    if (idx < 7.5) return 6.0 / 16.0;
    if (idx < 8.5) return 3.0 / 16.0;
    if (idx < 9.5) return 11.0 / 16.0;
    if (idx < 10.5) return 1.0 / 16.0;
    if (idx < 11.5) return 9.0 / 16.0;
    if (idx < 12.5) return 15.0 / 16.0;
    if (idx < 13.5) return 7.0 / 16.0;
    if (idx < 14.5) return 13.0 / 16.0;
    return 5.0 / 16.0;
}

vec3 nearestPaletteColor(vec3 c) {
    vec3 best = u_palette[0];
    float bestDist = 999.0;
    for (int i = 0; i < 16; i++) {
        if (float(i) >= u_palette_count) break;
        float dist = distance(c, u_palette[i]);
        if (dist < bestDist) { bestDist = dist; best = u_palette[i]; }
    }
    return best;
}

void main() {
    vec2 warpUv = vUv;
    
    if (u_is_web_mode > 0.5 && u_fluid > 0.5) {
        float mDist = distance(vUv, u_mouse_pos);
        vec2 dir = vUv - u_mouse_pos;
        float repelStr = smoothstep(0.2, 0.0, mDist);
        warpUv += dir * repelStr * 0.15;
    }

    if (u_flow > 0.5) {
        float n1 = valueNoise(warpUv * 3.0 + u_time * u_flow_speed);
        float n2 = valueNoise(warpUv * 3.0 + vec2(5.2, 1.3) + u_time * u_flow_speed);
        warpUv += (vec2(n1, n2) - 0.5) * u_flow_strength * 0.05;
    }

    float aspect = u_resolution.x / u_resolution.y;
    vec2 grid = vec2(u_density, (u_density / aspect) * u_font_aspect);

    vec2 cellScreenUv = floor(warpUv * grid) / grid;

    vec2 screenRatio = u_resolution;
    vec2 mediaRatio = u_media_resolution;
    vec2 scale = vec2(1.0);

    if (screenRatio.x / screenRatio.y > mediaRatio.x / mediaRatio.y) {
        scale.y = (screenRatio.y / screenRatio.x) * (mediaRatio.x / mediaRatio.y);
    } else {
        scale.x = (screenRatio.x / screenRatio.y) * (mediaRatio.y / mediaRatio.x);
    }

    scale /= u_zoom;
    vec2 maxOffset = max(vec2(0.0), 1.0 - scale) / 2.0;
    vec2 pan = vec2(u_mouse_offset.x, -u_mouse_offset.y) * maxOffset;
    vec2 mediaUv = (cellScreenUv - 0.5) * scale + 0.5 + pan;

    vec2 d = abs(mediaUv - 0.5) - 0.5;
    float distOutside = length(max(d, 0.0));
    
    float active_fade = u_edge_fade;
    if (u_is_web_mode > 0.5 && u_audio_level > 0.0) {
        active_fade = clamp(u_edge_fade + (u_audio_level * 0.6), 0.0, 1.0);
    }

    if (u_is_web_mode < 0.5 || active_fade <= 0.0) {
        if (distOutside > 0.0) {
            gl_FragColor = vec4(u_bg_color, 1.0);
            return;
        }
    }

    vec2 clampedMediaUv = clamp(mediaUv, 0.0, 1.0);

    vec2 caOffset = (mediaUv - 0.5) * u_chroma;
    float rChan = texture2D(tDiffuse, clamp(clampedMediaUv - caOffset, 0.0, 1.0)).r;
    float gChan = texture2D(tDiffuse, clampedMediaUv).g;
    float bChan = texture2D(tDiffuse, clamp(clampedMediaUv + caOffset, 0.0, 1.0)).b;
    vec4 color = vec4(rChan, gChan, bChan, 1.0);

    float lum = lumOf(color.rgb);

    if (lum > u_blackout_limit) {
        gl_FragColor = vec4(u_bg_color, 1.0);
        return;
    }
    
    if (u_audio_level > 0.0) lum = clamp(lum + u_audio_level * 0.4, 0.0, 1.0);
    if (u_eye_saver > 0.5) lum = min(lum, 0.75); 

    float vEdge = 0.05 * u_vibrancy;
    lum = smoothstep(vEdge, 1.0 - vEdge, lum);

    if (u_is_web_mode > 0.5 && active_fade > 0.0) {
        lum -= distOutside * (1.5 / max(active_fade, 0.01));
        lum = max(lum, 0.0);
    }
    
    vec3 satColor = mix(vec3(lum), color.rgb, u_saturation);
    if (u_audio_level > 0.0) satColor *= (1.0 + (u_audio_level * 0.5));

    vec2 cellCoord = floor(warpUv * grid);
    float ditherOn = step(0.5, u_dither);
    float charDither = (bayer4x4(cellCoord) - 0.5) * ditherOn;
    float colorDither = (bayer4x4(cellCoord + vec2(7.0, 3.0)) - 0.5) * ditherOn;

    vec3 qColor;
    if (u_palette_mode > 0.5) {
        qColor = nearestPaletteColor(satColor + colorDither * 0.05);
    } else {
        qColor = floor(satColor * u_color_steps + 0.5 + colorDither) / u_color_steps;
    }

    float charLum = clamp(lum + charDither / max(u_chars_count, 2.0), 0.0, 1.0);
    float charIndex = floor(charLum * (u_chars_count - 1.0) + 0.5);

    vec2 localUv = fract(warpUv * grid);
    vec2 atlasUv = vec2((charIndex + localUv.x) / u_chars_count, localUv.y);
    float rawAlpha = texture2D(u_atlas, atlasUv).r;
    float mainGlyphAlpha = mix(rawAlpha, smoothstep(0.35, 0.65, rawAlpha), step(0.5, u_crisp));

    float glyphAlpha = mainGlyphAlpha;
    vec2 texel = 1.0 / u_media_resolution;
    float gx = 0.0; float gy = 0.0; float edgeMag = 0.0;
    bool haveGradient = false;

    if (u_edge_detect > 0.5 || u_depth_extrude > 0.5) {
        float tl = lumAt(mediaUv + texel * vec2(-1.0, 1.0));
        float tC = lumAt(mediaUv + texel * vec2(0.0, 1.0));
        float tr = lumAt(mediaUv + texel * vec2(1.0, 1.0));
        float mLft = lumAt(mediaUv + texel * vec2(-1.0, 0.0));
        float mRgt = lumAt(mediaUv + texel * vec2(1.0, 0.0));
        float bl = lumAt(mediaUv + texel * vec2(-1.0, -1.0));
        float bC = lumAt(mediaUv + texel * vec2(0.0, -1.0));
        float br = lumAt(mediaUv + texel * vec2(1.0, -1.0));
        gx = (tr + 2.0 * mRgt + br) - (tl + 2.0 * mLft + bl);
        gy = (bl + 2.0 * bC + br) - (tl + 2.0 * tC + tr);
        edgeMag = length(vec2(gx, gy));
        haveGradient = true;
    }

    if (u_edge_detect > 0.5 && edgeMag * u_edge_strength > 0.12) {
        float edgeAngle = mod(atan(gy, gx) + PI * 0.5, PI);

        if (u_edge_continuous > 0.5) {
            vec2 rc = localUv - 0.5;
            float ca = cos(edgeAngle - PI * 0.5);
            float sa = sin(edgeAngle - PI * 0.5);
            vec2 rot = vec2(rc.x * ca - rc.y * sa, rc.x * sa + rc.y * ca) + 0.5;
            glyphAlpha = texture2D(u_stroke_atlas, clamp(rot, 0.0, 1.0)).r;
        } else {
            float dHoriz = min(edgeAngle, PI - edgeAngle);
            float dDiag1 = abs(edgeAngle - PI * 0.25);
            float dVert  = abs(edgeAngle - PI * 0.5);
            float dDiag2 = abs(edgeAngle - PI * 0.75);
            float edgeCharIndex = 0.0;
            float minD = dHoriz;
            if (dDiag1 < minD) { minD = dDiag1; edgeCharIndex = 1.0; }
            if (dVert  < minD) { minD = dVert;  edgeCharIndex = 2.0; }
            if (dDiag2 < minD) { minD = dDiag2; edgeCharIndex = 3.0; }
            vec2 edgeAtlasUv = vec2((edgeCharIndex + localUv.x) / 4.0, localUv.y);
            glyphAlpha = texture2D(u_edge_atlas, edgeAtlasUv).r;
        }
    }

    vec3 finalColor = u_bg_color;

    if (u_depth_extrude > 0.5 && haveGradient) {
        vec2 gradDir = vec2(gx, gy) * u_depth_strength * 0.4;
        vec2 shadowLocal = fract(warpUv * grid - gradDir);
        vec2 shadowAtlasUv = vec2((charIndex + shadowLocal.x) / u_chars_count, shadowLocal.y);
        float shadowAlpha = texture2D(u_atlas, shadowAtlasUv).r;
        finalColor = mix(finalColor, qColor * 0.25, shadowAlpha * 0.55);
    }

    if (u_multilayer > 0.5) {
        float hatchFreq = grid.x * 1.5;
        float hatchPattern = abs(fract((cellScreenUv.x - cellScreenUv.y) * hatchFreq) - 0.5) * 2.0;
        float hatchMask = (1.0 - lum) * step(hatchPattern, 0.15);
        finalColor = mix(finalColor, qColor * 0.5, hatchMask * 0.3);
    }

    finalColor = mix(finalColor, qColor, glyphAlpha);

    if (u_is_web_mode > 0.5 && u_scanlines > 0.5) {
        float scan = sin(gl_FragCoord.y * 1.0 + u_time * 6.0) * 0.5 + 0.5;
        finalColor *= mix(0.85, 1.0, scan);
    }
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;
