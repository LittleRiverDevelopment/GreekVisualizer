import katex from 'katex';

export function Formula({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = katex.renderToString(tex, {
    throwOnError: false,
    displayMode: display,
    output: 'html',
    strict: 'ignore',
  });
  if (display) {
    return <div className="overflow-x-auto py-1" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
