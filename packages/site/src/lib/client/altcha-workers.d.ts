// Worker-Importe von Vite (`?worker`): Vite legt den Worker als eigene Datei ab.
declare module 'altcha/workers/pbkdf2?worker' {
	const WorkerConstructor: new () => Worker;
	export default WorkerConstructor;
}

declare module 'altcha/workers/sha?worker' {
	const WorkerConstructor: new () => Worker;
	export default WorkerConstructor;
}
