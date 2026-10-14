import React from 'react';

type Values = Record<string, unknown>;

const interpolate = (template: string, values?: Values): string =>
  template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    values && name in values ? String(values[name]) : match
  );

/** `t` stand-in: supports `t(key, 'Default', values)` and `t(key, { defaultValue, ...values })`. */
export const mockT = (
  key: string,
  second?: string | Values,
  third?: Values
): string => {
  if (typeof second === 'string') return interpolate(second, third);
  const defaultValue = second?.['defaultValue'];
  return interpolate(
    typeof defaultValue === 'string' ? defaultValue : key,
    second
  );
};

type Node = string | { tag: string; children: Node[]; selfClosing: boolean };

const parse = (input: string): Node[] => {
  const root: Node[] = [];
  const stack: { tag: string; children: Node[] }[] = [];
  const current = (): Node[] => stack[stack.length - 1]?.children ?? root;
  const tokens = /<(\/?)(\w+)(\/?)>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(input))) {
    if (match.index > last) current().push(input.slice(last, match.index));
    last = tokens.lastIndex;
    const closing = match[1];
    const tag = match[2] ?? '';
    const selfClosing = match[3];
    if (selfClosing) current().push({ tag, children: [], selfClosing: true });
    else if (closing) {
      const done = stack.pop();
      if (done)
        current().push({
          tag: done.tag,
          children: done.children,
          selfClosing: false,
        });
    } else stack.push({ tag, children: [] });
  }
  if (last < input.length) current().push(input.slice(last));
  return root;
};

const render = (
  nodes: Node[],
  components: Record<string, React.ReactElement>
): React.ReactNode[] =>
  nodes.map((node, i) => {
    if (typeof node === 'string') return node;
    const element = components[node.tag];
    if (!element) return render(node.children, components);
    return node.selfClosing
      ? React.cloneElement(element, { key: i })
      : React.cloneElement(
          element,
          { key: i },
          ...render(node.children, components)
        );
  });

/** `<Trans>` stand-in: renders the English defaults with the given components. */
export const MockTrans = ({
  i18nKey,
  defaults,
  values,
  components = {},
}: {
  i18nKey?: string;
  defaults?: string;
  values?: Values;
  components?: Record<string, React.ReactElement>;
}) =>
  React.createElement(
    React.Fragment,
    null,
    ...render(parse(interpolate(defaults ?? i18nKey ?? '', values)), components)
  );

export const reactI18nextMock = {
  useTranslation: () => ({
    t: mockT,
    i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
  }),
  Trans: MockTrans,
  initReactI18next: { type: '3rdParty', init: () => undefined },
};
