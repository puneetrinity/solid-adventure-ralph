import { Highlight, themes } from 'prism-react-renderer';

interface DiffViewerProps {
  diff: string;
  filePath?: string;
}

// Map file extensions to Prism language identifiers
function getLanguageFromPath(filePath?: string): string {
  if (!filePath) return 'plaintext';

  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'markup',
    html: 'markup',
    htm: 'markup',
    css: 'css',
    scss: 'scss',
    less: 'less',
    md: 'markdown',
    dockerfile: 'docker',
    prisma: 'graphql', // Close approximation for Prisma schema
    graphql: 'graphql',
    gql: 'graphql',
  };

  return languageMap[ext || ''] || 'plaintext';
}

// Extract file path from diff header
function extractFilePath(diff: string): string | undefined {
  const lines = diff.split('\n');
  for (const line of lines) {
    // Match +++ b/path/to/file.ext or +++ path/to/file.ext
    const match = line.match(/^\+\+\+ (?:b\/)?(.+)$/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

export function DiffViewer({ diff, filePath }: DiffViewerProps) {
  const lines = diff.split('\n');
  const detectedPath = filePath || extractFilePath(diff);
  const language = getLanguageFromPath(detectedPath);

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
              : 'bg-white';

            // Get the content without the diff prefix for syntax highlighting
            const content = lineType === 'add' || lineType === 'remove'
              ? line.slice(1)
              : line;

            // Header lines don't need syntax highlighting
            if (lineType === 'header') {
              return (
                <tr key={index} className={bgColor}>
                  <td className="px-2 py-0.5 text-gray-400 text-right select-none w-12 border-r border-gray-200">
                    {index + 1}
                  </td>
                  <td className="px-3 py-0.5 whitespace-pre text-blue-700">
                    {line}
                  </td>
                </tr>
              );
            }

            return (
              <tr key={index} className={bgColor}>
                <td className="px-2 py-0.5 text-gray-400 text-right select-none w-12 border-r border-gray-200">
                  {index + 1}
                </td>
                <td className="px-3 py-0.5 whitespace-pre">
                  {/* Show diff prefix (+/-/space) */}
                  {(lineType === 'add' || lineType === 'remove') && (
                    <span className={lineType === 'add' ? 'text-green-700' : 'text-red-700'}>
                      {line.charAt(0)}
                    </span>
                  )}
                  {/* Syntax highlighted content */}
                  <HighlightedLine code={content} language={language} lineType={lineType} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Individual line highlighting component
function HighlightedLine({
  code,
  language,
  lineType
}: {
  code: string;
  language: string;
  lineType: 'add' | 'remove' | 'header' | 'normal';
}) {
  // Apply a subtle tint based on line type
  const tintClass = lineType === 'add'
    ? 'text-green-800'
    : lineType === 'remove'
    ? 'text-red-800'
    : '';

  return (
    <Highlight theme={themes.github} code={code} language={language}>
      {({ tokens, getTokenProps }) => (
        <span className={tintClass}>
          {tokens.map((tokenLine, lineIndex) => (
            <span key={lineIndex}>
              {tokenLine.map((token, tokenIndex) => {
                const tokenProps = getTokenProps({ token });
                // For add/remove lines, blend the syntax color with green/red tint
                const style = lineType !== 'normal'
                  ? { ...tokenProps.style, opacity: 0.9 }
                  : tokenProps.style;
                return (
                  <span key={tokenIndex} {...tokenProps} style={style} />
                );
              })}
            </span>
          ))}
        </span>
      )}
    </Highlight>
  );
}

function getLineType(line: string): 'add' | 'remove' | 'header' | 'normal' {
  if (line.startsWith('+++') || line.startsWith('---')) {
    return 'header';
  }
  if (line.startsWith('@@')) {
    return 'header';
  }
  if (line.startsWith('diff --git')) {
    return 'header';
  }
  if (line.startsWith('index ')) {
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
