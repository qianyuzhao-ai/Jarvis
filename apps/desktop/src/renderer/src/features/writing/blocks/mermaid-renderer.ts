let pending: Promise<unknown> = Promise.resolve();
export function renderMermaid(source: string, dark: boolean) {
  const task = pending.then(async () => {
    const { default: mermaid } = await import('mermaid');
    const style = getComputedStyle(document.documentElement);
    const color = (name: string) => style.getPropertyValue(name).trim();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      maxTextSize: 100000,
      secure: [
        ...new Set([
          ...(mermaid.mermaidAPI.defaultConfig.secure ?? []),
          'secure',
          'securityLevel',
          'startOnLoad',
          'maxTextSize',
          'suppressErrorRendering',
          'themeCSS',
          'fontFamily',
          'themeVariables',
          'flowchart',
        ]),
      ],
      theme: 'base',
      flowchart: { htmlLabels: false },
      themeVariables: {
        darkMode: dark,
        primaryColor: color('--color-surface-raised'),
        primaryTextColor: color('--color-fg'),
        primaryBorderColor: color('--color-border'),
        lineColor: color('--color-fg-secondary'),
        secondaryColor: color('--color-fill'),
        tertiaryColor: color('--color-surface'),
        fontFamily: style.fontFamily,
      },
    });
    const result = await mermaid.render('writing-mermaid-' + crypto.randomUUID(), source);
    return result.svg;
  });
  pending = task.catch(() => undefined);
  return task;
}
