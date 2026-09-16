export type PresetState = Record<string, any>;

export const FACTORY_PRESETS: Record<string, PresetState> = {
    "Matrix": {
        charRamp: " .:-=+*#%@01", fontAspect: 0.55, density: 140, colorSteps: 6, saturation: 0,
        blackout: 1.0, vibrancy: 1.4, eyeSaver: false, fade: 0.1, fluid: true, edgeDetect: false,
        edgeStrength: 1, edgeContinuous: false, dither: true, chroma: 0, scanlines: true,
        crisp: false, depthExtrude: false, depthStrength: 1, multilayer: false, paletteMode: false,
        paletteName: 'cga', flow: true, flowSpeed: 0.4, flowStrength: 0.6, temporalOn: true,
        temporalBlend: 0.8, bgHex: '#000000'
    },
    "Cyberpunk CRT": {
        charRamp: " .:-=+*#%@", fontAspect: 0.55, density: 110, colorSteps: 8, saturation: 1.6,
        blackout: 1.0, vibrancy: 1.6, eyeSaver: false, fade: 0.2, fluid: true, edgeDetect: true,
        edgeStrength: 1.2, edgeContinuous: true, dither: true, chroma: 0.012, scanlines: true,
        crisp: false, depthExtrude: false, depthStrength: 1, multilayer: false, paletteMode: false,
        paletteName: 'c64', flow: false, flowSpeed: 0.3, flowStrength: 1, temporalOn: false,
        temporalBlend: 0.7, bgHex: '#000000'
    },
    "Charcoal Sketch": {
        charRamp: " `.'-,:;!+*=<>vluoxzXYUJT#8%@", fontAspect: 0.5, density: 160, colorSteps: 3,
        saturation: 0, blackout: 1.0, vibrancy: 1.0, eyeSaver: false, fade: 0, fluid: false,
        edgeDetect: true, edgeStrength: 1.4, edgeContinuous: true, dither: true, chroma: 0,
        scanlines: false, crisp: true, depthExtrude: true, depthStrength: 1.2, multilayer: true,
        paletteMode: false, paletteName: 'cga', flow: false, flowSpeed: 0.3, flowStrength: 1,
        temporalOn: false, temporalBlend: 0.7, bgHex: '#e6dbc3'
    },
    "Game Boy": {
        charRamp: " .:+#@", fontAspect: 0.6, density: 90, colorSteps: 4, saturation: 1,
        blackout: 1.0, vibrancy: 1.2, eyeSaver: false, fade: 0, fluid: false, edgeDetect: false,
        edgeStrength: 1, edgeContinuous: false, dither: true, chroma: 0, scanlines: false,
        crisp: false, depthExtrude: false, depthStrength: 1, multilayer: false, paletteMode: true,
        paletteName: 'gameboy', flow: false, flowSpeed: 0.3, flowStrength: 1, temporalOn: false,
        temporalBlend: 0.7, bgHex: '#0f380f'
    }
};
