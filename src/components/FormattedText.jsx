import katex from 'katex';
import 'katex/dist/katex.min.css';

function tryKatex(math, displayMode) {
    try { return katex.renderToString(math, { displayMode, throwOnError: false, output: 'html' }); }
    catch { return null; }
}

function processText(str) {
    if (typeof str === 'object') return JSON.stringify(str);
    if (typeof str !== 'string') return String(str);

    const rendered = [];
    let out = str;

    // Extract math before text replacements so they can't corrupt LaTeX syntax
    out = out.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
        const html = tryKatex(math.trim(), true) ?? match;
        rendered.push(html);
        return `\x00M${rendered.length - 1}\x00`;
    });
    out = out.replace(/\$([^\$\n]+?)\$/g, (match, math) => {
        const html = tryKatex(math.trim(), false) ?? match;
        rendered.push(html);
        return `\x00M${rendered.length - 1}\x00`;
    });

    // Text replacements (math is protected by placeholders)
    out = out
        .replace(/ewline/g, '<br/>')
        .replace(/\\newline/g, '<br/>')
        .replace(/\\\\n/g, '<br/>')
        .replace(/\\n/g, '<br/>')
        .replace(/\n/g, '<br/>')
        .replace(/\\textbf\{([^\}]+)\}/g, '<strong>$1</strong>')
        .replace(/\\text\{([^\}]+)\}/g, '$1')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/:\$/g, ':');

    // Restore rendered math
    rendered.forEach((html, i) => { out = out.replace(`\x00M${i}\x00`, html); });
    return out;
}

const FormattedText = ({ text, className = "" }) => {
    if (text === null || text === undefined) return null;
    return <div className={className} dangerouslySetInnerHTML={{ __html: processText(text) }} />;
};

export default FormattedText;
