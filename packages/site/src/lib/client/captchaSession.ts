// Sicherheitsprüfung (ALTCHA) einer Einsendung, gemeinsam für `createLeadClient` und `createBookingClient`:
// startet beim ersten Anfassen, löst unsichtbar im Web Worker, eine Lösung gilt genau einmal. Ein Weg für
// Formular und Buchung, damit beide denselben Schutz haben.
import { captchaAdapter, type CaptchaHandle } from './captcha.js';
import { captchaChallengeUrl } from './siteApi.js';

const CAPTCHA_TIMEOUT_MS = 60_000;

/** @internal */
export interface CaptchaSession {
	/** Startet die Prüfung im Hintergrund. Mehrfach aufrufbar. */
	start(): void;
	/** Wartet auf eine frische Lösung. `null`: Die Prüfung ließ sich nicht durchführen. */
	solution(): Promise<string | null>;
	/** Nach einer Antwort des Servers: Lösung verbrauchen und gleich die nächste Aufgabe lösen. */
	consume(): void;
	/** Nach Erfolg: Lösung verwerfen, ohne neu zu rechnen (der nächste Versuch startet neu). */
	clear(): void;
	destroy(): void;
}

/** @internal */
export interface CaptchaSessionOptions {
	/** Kennung am versteckten Element (`data-ds-captcha`), z. B. der Schlüssel des Formulars. */
	name: string;
	/** Eigenes Element für das unsichtbare Widget. Standard: ein verstecktes Element am Ende von `<body>`. */
	element?: () => HTMLElement | null;
}

/** @internal */
export function createCaptchaSession(options: CaptchaSessionOptions): CaptchaSession {
	type State = 'idle' | 'loading' | 'solving' | 'ready' | 'expired' | 'failed';
	let state: State = 'idle';
	let solution: string | null = null;
	let handle: CaptchaHandle | null = null;
	let host: HTMLElement | null = null;
	let ownHost = false;
	let destroyed = false;
	const waiters: ((solution: string | null) => void)[] = [];

	function settle(value: string | null): void {
		for (const resolve of waiters.splice(0)) resolve(value);
	}

	function captchaHost(): HTMLElement {
		const given = options.element?.();
		if (given) return given;
		if (!host) {
			host = document.createElement('div');
			host.hidden = true;
			host.dataset.dsCaptcha = options.name;
			document.body.append(host);
			ownHost = true;
		}
		return host;
	}

	async function start(): Promise<void> {
		if (state !== 'idle' || destroyed || typeof window === 'undefined') return;
		state = 'loading';
		try {
			handle = await captchaAdapter()(captchaHost(), captchaChallengeUrl(), {
				onSolved(payload) {
					solution = payload;
					state = 'ready';
					settle(payload);
				},
				onCleared() {
					solution = null;
					state = 'expired';
				},
				onError() {
					solution = null;
					state = 'failed';
					settle(null);
				},
			});
			if (state === 'loading') state = 'solving';
		} catch {
			state = 'failed';
			settle(null);
		}
	}

	return {
		start() {
			void start();
		},
		solution() {
			if (state === 'ready' && solution) return Promise.resolve(solution);
			const waiting = new Promise<string | null>((resolve) => {
				waiters.push(resolve);
				setTimeout(() => resolve(null), CAPTCHA_TIMEOUT_MS);
			});
			if (state === 'failed') {
				handle?.destroy();
				handle = null;
				state = 'idle';
			}
			if (state === 'idle') void start();
			else if (state === 'expired' || (state === 'ready' && !solution)) {
				state = 'solving';
				handle?.reset();
			}
			return waiting;
		},
		consume() {
			solution = null;
			if (handle && state !== 'failed') {
				state = 'solving';
				handle.reset();
			}
		},
		clear() {
			solution = null;
		},
		destroy() {
			destroyed = true;
			handle?.destroy();
			handle = null;
			if (ownHost) host?.remove();
			settle(null);
		},
	};
}
