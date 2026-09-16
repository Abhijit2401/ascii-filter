import * as THREE from 'three';

export const PALETTES: Record<string, string[]> = {
    cga: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
    gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    c64: ['#000000', '#ffffff', '#68372b', '#70a4b2', '#6f3d86', '#588d43', '#352879', '#b8c76f'],
    'mono-amber': ['#000000', '#3a1c00', '#a35a00', '#ffb000']
};
export function hexToVec3(hex: string): [number, number, number] {
    const c = new THREE.Color(hex);
    return [c.r, c.g, c.b];
}
