import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { messages } from '../../src/i18n';

describe('auth entry page', () => {
  it('renders the English dictionary and a semantic page heading', () => {
    const markup = renderToStaticMarkup(createElement(App));
    expect(markup).toContain(messages.app.title);
    expect(markup).toContain(messages.auth.unconfiguredTitle);
    expect(markup).not.toContain(messages.dashboard.title);
    expect(markup).toMatch(/<h1[^>]*>/);
  });
});
