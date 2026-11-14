import { useState } from 'react';
import type { AppModel } from '../scenario/model';
import { deleteScenario, loadSavedScenarios, saveScenario, type SavedScenario } from '../scenario/storage';

interface SavedScenariosProps {
  model: AppModel;
  onLoad: (search: string) => void;
}

export function SavedScenarios({ model, onLoad }: SavedScenariosProps) {
  const [rows, setRows] = useState<SavedScenario[]>(() => loadSavedScenarios());
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);

  return (
    <details className="panel">
      <summary className="cursor-pointer text-sm font-semibold">Saved scenarios on this browser</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm leading-6 text-muted">
          Names are stored in localStorage on this browser only. Nothing is uploaded, and there is no account. Clearing
          site data deletes them. A shared link is separate: it lives in the URL, not in this list.
        </p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              setRows(saveScenario(name, model));
              setName('');
              setNote('Saved in this browser.');
            } catch {
              setNote('This browser blocked local storage, so the scenario was not saved.');
            }
          }}
        >
          <label className="text-sm">
            <span className="sr-only">Scenario name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name this scenario"
              maxLength={80}
              className="rounded-md border border-line bg-card px-2 py-2 text-sm"
            />
          </label>
          <button type="submit" className="btn">
            Save locally
          </button>
        </form>
        {note ? <p role="status" className="text-sm text-accent">{note}</p> : null}
        {rows.length === 0 ? <p className="text-sm text-muted">No saved scenarios yet.</p> : null}
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
              <span className="text-sm">
                {row.name}
                <span className="ml-2 text-xs text-muted">{new Date(row.savedAt).toLocaleString()}</span>
              </span>
              <span className="flex gap-2">
                <button type="button" className="btn" onClick={() => onLoad(row.search)}>
                  Load
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setRows(deleteScenario(row.id));
                    setNote(`Deleted “${row.name}” from this browser.`);
                  }}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
