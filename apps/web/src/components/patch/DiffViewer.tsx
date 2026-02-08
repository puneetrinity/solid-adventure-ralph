interface DiffViewerProps {
  diff: string;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  const lines = diff.split('\n');

  return (
    <div className="font-mono text-sm overflow-x-auto">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, index) => {
            const lineType = getLineType(line);
            const bgColor = lineType === 'add'
              ? 'bg-green-50'
              : lineType === 'remove'
              ? 'bg-red-50'
              : lineType === 'header'
              ? 'bg-blue-50'
              : '';
            const textColor = lineType === 'add'
              ? 'text-green-700'
              : lineType === 'remove'
              ? 'text-red-700'
              : lineType === 'header'
              ? 'text-blue-700'
              : 'text-gray-700';

            return (
              <tr key={index} className={bgColor}>
                <td className="px-2 py-0.5 text-gray-400 text-right select-none w-12 border-r border-gray-200">
                  {index + 1}
                </td>
                <td className={`px-3 py-0.5 whitespace-pre ${textColor}`}>
                  {line}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getLineType(line: string): 'add' | 'remove' | 'header' | 'normal' {
  if (line.startsWith('+++') || line.startsWith('---')) {
    return 'header';
  }
  if (line.startsWith('@@')) {
    return 'header';
  }
  if (line.startsWith('+')) {
    return 'add';
  }
  if (line.startsWith('-')) {
    return 'remove';
  }
  return 'normal';
}
