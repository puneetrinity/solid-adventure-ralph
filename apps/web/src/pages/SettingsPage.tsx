export function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Display Preferences
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Diff View Mode
            </label>
            <select className="px-3 py-2 border border-gray-200 rounded-md text-sm">
              <option value="unified">Unified</option>
              <option value="split">Split</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          API Configuration
        </h2>
        <p className="text-sm text-gray-500">
          API Base URL:{' '}
          <code className="bg-gray-100 px-1 py-0.5 rounded">
            {import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}
          </code>
        </p>
      </div>
    </div>
  );
}
