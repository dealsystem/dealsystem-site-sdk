// Farben lesen und Kontrast nach WCAG 2.1 berechnen.

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

function clamp(n: number): number {
	return Math.min(255, Math.max(0, n));
}

function hslToRgb(h: number, s: number, l: number): Rgb {
	const hue = (((h % 360) + 360) % 360) / 360;
	const k = (n: number): number => (n + hue * 12) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

const NAMED: Record<string, Rgb> = {
	white: { r: 255, g: 255, b: 255 },
	black: { r: 0, g: 0, b: 0 },
};

/** Liest `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `white`, `black`. Sonst `null`. */
export function parseColor(raw: string): Rgb | null {
	const v = raw.trim().toLowerCase();
	const named = NAMED[v];
	if (named) return named;
	let m = /^#([0-9a-f]{3,4})$/.exec(v);
	if (m?.[1]) {
		const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
		return { r: r ?? 0, g: g ?? 0, b: b ?? 0 };
	}
	m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(v);
	if (m?.[1]) {
		const n = parseInt(m[1], 16);
		return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
	}
	m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(v);
	if (m) return { r: clamp(Number(m[1])), g: clamp(Number(m[2])), b: clamp(Number(m[3])) };
	m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(v);
	if (m) return hslToRgb(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100);
	return null;
}

function channel(c: number): number {
	const s = c / 255;
	return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(c: Rgb): number {
	return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** Kontrastverhältnis, auf zwei Stellen abgerundet (4,499 zählt nicht als 4,5). */
export function contrastRatio(a: Rgb, b: Rgb): number {
	const la = luminance(a);
	const lb = luminance(b);
	const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
	return Math.floor(ratio * 100) / 100;
}
