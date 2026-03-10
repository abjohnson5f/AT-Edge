import { useState } from 'react';
import { Bell } from 'lucide-react';

const TABS = ['Alerts', 'History', 'System'] as const;

export function AlertsPanel() {
  const [activeTab, setActiveTab] = useState<string>('Alerts');

  return (
    <div className="panel-card">
      <div className="panel-card-header">
        <span className="panel-card-title">Alerts</span>
      </div>

      <div className="alerts-tabs">
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            className={`alert-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <Bell size={32} className="text-zinc-500 mb-3" />
        <p className="text-sm text-zinc-400 max-w-xs">
          Alert system coming soon. Alerts will trigger on bid imbalances, price thresholds, and new listings at watched locations.
        </p>
      </div>
    </div>
  );
}
