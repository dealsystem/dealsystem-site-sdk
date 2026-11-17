import type { OutputContext, SourceContext } from './context.js';
import type { RawFinding } from './types.js';

export interface SourceRule {
	id: string;
	stage: 'source';
	run(ctx: SourceContext): RawFinding[];
}

export interface OutputRule {
	id: string;
	stage: 'output';
	run(ctx: OutputContext): RawFinding[];
}

export type RuleImpl = SourceRule | OutputRule;

export function sourceRule(id: string, run: (ctx: SourceContext) => RawFinding[]): SourceRule {
	return { id, stage: 'source', run };
}

export function outputRule(id: string, run: (ctx: OutputContext) => RawFinding[]): OutputRule {
	return { id, stage: 'output', run };
}
