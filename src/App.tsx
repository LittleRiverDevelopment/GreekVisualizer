import { Component, useEffect, useState, type ReactNode } from 'react';
import type { GuideDefinition } from './content/guides';
import { AmericanPanel } from './components/AmericanPanel';
import { ExplorerPanel } from './components/ExplorerPanel';
import { Header } from './components/Header';
import { SavedScenarios } from './components/SavedScenarios';
import { StrategyPanel } from './components/StrategyPanel';
import { useTheme, useWebGL } from './lib/hooks';
import {
  defaultModel,
  type AppModel,
  type ExplorerInput,
  type TabId,
  type ViewInput,
} from './scenario/model';
import { parseScenario, serializeScenario } from './scenario/url';

const TABS: { id: TabId; label: string }[] = [
  { id: 'explorer', label: 'Explorer' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'american', label: 'American' },
];

export function App() {
  const initial = parseScenario(window.location.search);
  const [model, setModel] = useState<AppModel>(initial.model);
  const [warning, setWarning] = useState<string | null>(initial.warning);
  const [notice, setNotice] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const { theme, toggle } = useTheme();
  const webgl = useWebGL();

  useEffect(() => {
    const id = window.setTimeout(() => {
      const next = `${window.location.pathname}${serializeScenario(model)}`;
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== next) window.history.replaceState(null, '', next);
    }, 120);
    return () => window.clearTimeout(id);
  }, [model]);

  function patchExplorer(patch: Partial<ExplorerInput>) {
    setModel((current) => ({ ...current, explorer: { ...current.explorer, ...patch } }));
  }

  function patchView(patch: Partial<ViewInput>) {
    setModel((current) => ({ ...current, view: { ...current.view, ...patch } }));
  }

  function applyGuide(guide: GuideDefinition) {
    setModel((current) => ({
      ...current,
      explorer: { ...current.explorer, ...guide.explorer },
      view: {
        ...current.view,
        ...guide.view,
        tab: 'explorer',
        guide: guide.id,
        sliceHeld: null,
      },
    }));
    setNotice(`Loaded “${guide.title}”.`);
    setFormKey((key) => key + 1);
  }

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}${serializeScenario(model)}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copied. It encodes this scenario in the query string.');
    } catch {
      setNotice(url);
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Header
        onReset={() => {
          setModel(defaultModel());
          setWarning(null);
          setNotice('Reset to defaults.');
          setFormKey((key) => key + 1);
        }}
        onShare={() => void share()}
        theme={theme}
        onToggleTheme={toggle}
        notice={notice}
      />
      <main id="main" className="mx-auto max-w-[1400px] space-y-4 px-4 py-4">
        {warning ? (
          <p role="status" className="panel text-sm text-warn">
            {warning}
          </p>
        ) : null}
        <div role="tablist" aria-label="Sections" className="flex flex-wrap gap-2" onKeyDown={(event) => {
          const index = TABS.findIndex((tab) => tab.id === model.view.tab);
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          event.preventDefault();
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          const next = TABS[(index + direction + TABS.length) % TABS.length];
          if (next) patchView({ tab: next.id });
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={model.view.tab === tab.id}
              aria-controls="active-panel"
              className="segment btn"
              onClick={() => patchView({ tab: tab.id })}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <SavedScenarios
          model={model}
          onLoad={(search) => {
            const parsed = parseScenario(search);
            setModel(parsed.model);
            setWarning(parsed.warning);
            setNotice('Loaded a scenario saved in this browser.');
            setFormKey((key) => key + 1);
          }}
        />
        <ViewBoundary key={model.view.tab} resetKey={formKey} tabId={model.view.tab}>
          {model.view.tab === 'explorer' ? (
            <ExplorerPanel
              key={formKey}
              explorer={model.explorer}
              view={model.view}
              theme={theme}
              webgl={webgl}
              onExplorer={patchExplorer}
              onView={patchView}
              onGuide={applyGuide}
            />
          ) : null}
          {model.view.tab === 'strategy' ? (
            <StrategyPanel
              key={formKey}
              explorer={model.explorer}
              view={model.view}
              legs={model.strategy.legs}
              showSurface={model.strategy.showSurface}
              theme={theme}
              webgl={webgl}
              onExplorer={patchExplorer}
              onView={patchView}
              onLegs={(legs) => setModel((current) => ({ ...current, strategy: { ...current.strategy, legs } }))}
              onShowSurface={(showSurface) =>
                setModel((current) => ({ ...current, strategy: { ...current.strategy, showSurface } }))
              }
            />
          ) : null}
          {model.view.tab === 'american' ? (
            <AmericanPanel
              key={formKey}
              explorer={model.explorer}
              steps={model.view.steps}
              onExplorer={patchExplorer}
              onSteps={(steps) => patchView({ steps })}
            />
          ) : null}
        </ViewBoundary>
        <footer className="pb-6 text-xs leading-5 text-muted">
          GreekVisualizer runs entirely in the browser. No analytics, no market-data request, and no account. Share links
          keep the /GreekVisualizer/ base path because they use this page’s address.
        </footer>
      </main>
    </div>
  );
}

class ViewBoundary extends Component<{ children: ReactNode; resetKey: number; tabId: string }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  componentDidUpdate(prev: { resetKey: number }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <p role="alert" className="panel text-sm">
          This view hit an unexpected error. Reset the scenario and try again. {this.state.error}
        </p>
      );
    }
    return (
      <div role="tabpanel" id="active-panel" aria-labelledby={`tab-${this.props.tabId}`}>
        {this.props.children}
      </div>
    );
  }
}
