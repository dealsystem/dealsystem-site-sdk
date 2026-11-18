// Zeichen-Offset → Zeile/Spalte (1-basiert).

export interface Position {
	line: number;
	column: number;
}

export class LineIndex {
	private readonly starts: number[] = [0];

	constructor(text: string) {
		for (let i = 0; i < text.length; i++) {
			if (text.charCodeAt(i) === 10) this.starts.push(i + 1);
		}
	}

	at(offset: number): Position {
		let lo = 0;
		let hi = this.starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if ((this.starts[mid] ?? 0) <= offset) lo = mid;
			else hi = mid - 1;
		}
		return { line: lo + 1, column: offset - (this.starts[lo] ?? 0) + 1 };
	}
}
