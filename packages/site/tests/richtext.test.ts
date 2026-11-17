import { plainParagraphs } from '../src/lib/richtext/escape.js';
import { defaultRichtextToHtml as richtextToHtml, RICHTEXT_MAX_LENGTH } from '../src/lib/richtext/server.js';

describe('defaultRichtextToHtml (Standardtexte aus dem Code, beim Build)', () => {
	it('wandelt Markdown in HTML um', () => {
		const html = richtextToHtml(
			'# Titel\n\nEin **fetter** Text mit [Link](https://beispiel.de).\n\n- eins\n- zwei',
		);
		expect(html).toContain('<h1>Titel</h1>');
		expect(html).toContain('<strong>fetter</strong>');
		expect(html).toContain('<a href="https://beispiel.de">Link</a>');
		expect(html).toContain('<li>eins</li>');
	});

	it.each([
		['<script>alert(1)</script>Text', /script|alert/],
		['<img src=x onerror=alert(1)>', /<img|onerror/],
		['[klick](javascript:alert(1))', /javascript:/],
		['<a href="https://a.de" onclick="x()">a</a>', /onclick/],
		['<iframe src="https://evil.test"></iframe>', /iframe|evil/],
		['<style>body{display:none}</style>', /style|display/],
		['<p style="position:fixed">x</p>', /style=/],
		['![Bild](https://tracker.test/pixel.gif)', /<img|tracker/],
		['<svg><script>alert(1)</script></svg>', /svg|script/],
		['<a href="//evil.test">x</a>', /evil/],
		['<a href="data:text/html,x">x</a>', /data:/],
		['<a href=" JaVaScRiPt:alert(1)">x</a>', /script/i],
	])('entfernt Gefährliches: %s', (source, forbidden) => {
		expect(richtextToHtml(source)).not.toMatch(forbidden);
	});

	it('setzt rel bei Links in neuem Tab und verwirft andere Ziele', () => {
		expect(richtextToHtml('<a href="https://a.de" target="_blank">a</a>')).toContain(
			'rel="noopener noreferrer"',
		);
		expect(richtextToHtml('<a href="https://a.de" target="top">a</a>')).not.toContain('target');
	});

	it('gibt für leere Eingaben eine leere Zeichenkette zurück', () => {
		expect(richtextToHtml('')).toBe('');
		expect(richtextToHtml(null)).toBe('');
	});

	it('fällt bei tief verschachtelten Zitaten auf maskierten Text zurück statt abzustürzen', () => {
		const html = richtextToHtml('> '.repeat(9000) + 'x');
		expect(typeof html).toBe('string');
		expect(html).not.toContain('<script');
	});

	it('parst überlange Texte nicht, sondern maskiert sie', () => {
		const html = richtextToHtml(`<b>x</b>${'a'.repeat(RICHTEXT_MAX_LENGTH)}`);
		expect(html.startsWith('<p>&lt;b&gt;x&lt;/b&gt;')).toBe(true);
	});
});

describe('plainParagraphs', () => {
	it('maskiert HTML und erhält Absätze und Zeilenumbrüche', () => {
		expect(plainParagraphs('Eins <b>\nzwei\n\nDrei & "vier"')).toBe(
			'<p>Eins &lt;b&gt;<br>zwei</p><p>Drei &amp; &quot;vier&quot;</p>',
		);
	});
});
