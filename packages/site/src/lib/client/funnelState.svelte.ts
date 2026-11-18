// Schritte eines mehrstufigen Formulars: welcher Schritt, Prüfung je Schritt, Fortschritt. Antworten nur im
// Arbeitsspeicher; zwischen Besuchen wird nichts gespeichert (dafür bräuchte es eine Einwilligung).
import type { LeadClient } from './leadClient.svelte.js';
import type { LeadValues } from '../types.js';

/** Ein Schritt: eine Überschrift und die Felder, die auf ihm stehen. */
export interface FunnelStep {
	/** Eindeutig, z. B. `objekt`. */
	id: string;
	/** Überschrift des Schritts, z. B. „Um welche Immobilie geht es?“. */
	title: string;
	/** Namen der Felder aus `dealsystem.config.ts`, die auf diesem Schritt stehen. Leer = ein Schritt ohne Felder. */
	fields: readonly string[];
}

export interface FunnelState<K extends string = string> {
	readonly steps: readonly FunnelStep[];
	/** Antworten, für `bind:value`. Bleiben beim Zurückgehen erhalten. */
	readonly values: LeadValues<K>;
	/** Fehler je Feld des aktuellen Schritts, nach `next()` oder `submit()`. */
	readonly errors: Record<string, string>;
	/** 0-basiert. */
	readonly index: number;
	readonly step: FunnelStep;
	readonly isFirst: boolean;
	readonly isLast: boolean;
	/** Für die Anzeige „Schritt 2 von 4“: 1-basiert. */
	readonly progress: { current: number; total: number; percent: number };
	/** Prüft den Schritt und geht weiter. `false`, wenn etwas fehlt (dann stehen die Texte in `errors`). */
	next(): boolean;
	back(): void;
	/** Prüft alles und sendet über den Client. Fehler bei Feldern führen zum ersten Schritt mit Fehler. */
	submit(): ReturnType<LeadClient<K>['submit']>;
}

/**
 * Hilfe für mehrstufige Formulare mit `createLeadClient()`: Schritte, Prüfung je Schritt, Fortschritt. Die
 * Oberfläche baust du selbst; setze beim Schrittwechsel den Fokus auf die Überschrift des neuen Schritts.
 *
 * @example
 * const lead = createLeadClient('bewertung');
 * const funnel = createFunnelState(lead, [
 * 	{ id: 'objekt', title: 'Um welche Immobilie geht es?', fields: ['objektart', 'wohnflaeche'] },
 * 	{ id: 'kontakt', title: 'Wohin dürfen wir die Einschätzung schicken?', fields: ['firstName', 'email'] },
 * ]);
 * // <input bind:value={funnel.values.wohnflaeche} />, <button onclick={() => funnel.next()}>Weiter</button>
 */
export function createFunnelState<K extends string>(
	client: LeadClient<K>,
	steps: readonly FunnelStep[],
): FunnelState<K> {
	if (steps.length === 0) throw new Error('[dealsystem] createFunnelState braucht mindestens einen Schritt.');
	const known = client.fields.map((f) => f.name);
	for (const step of steps) {
		for (const name of step.fields) {
			if (!known.includes(name)) {
				throw new Error(
					`[dealsystem] createFunnelState: Schritt "${step.id}" nennt das Feld "${name}", das im Formular "${client.funnel}" fehlt oder versteckt ist.`,
				);
			}
		}
	}

	const values = $state({} as LeadValues<K>);
	let errors = $state<Record<string, string>>({});
	let index = $state(0);

	const progress = $derived({
		current: index + 1,
		total: steps.length,
		percent: Math.round(((index + 1) / steps.length) * 100),
	});

	return {
		steps,
		values,
		get errors() {
			return errors;
		},
		get index() {
			return index;
		},
		get step() {
			return steps[index]!;
		},
		get isFirst() {
			return index === 0;
		},
		get isLast() {
			return index === steps.length - 1;
		},
		get progress() {
			return progress;
		},
		next() {
			client.prepare();
			errors = client.validate(values, steps[index]!.fields);
			if (Object.keys(errors).length > 0) return false;
			if (index < steps.length - 1) index += 1;
			return true;
		},
		back() {
			errors = {};
			if (index > 0) index -= 1;
		},
		async submit() {
			const result = await client.submit(values);
			if (!result.ok && result.reason === 'validation') {
				errors = result.fields;
				const first = steps.findIndex((s) => s.fields.some((f) => f in result.fields));
				if (first >= 0) index = first;
			} else {
				errors = {};
			}
			return result;
		},
	};
}
