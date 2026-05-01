import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MarkdownMessage({ content = "" }) {
  return (
    <div className="markdown-message">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }: any) => <a {...props} target="_blank" rel="noreferrer" />,
          code({ inline, className, children, ...props }: any) {
            if (inline) {
              return (
                <code className={`inline-code ${className || ""}`.trim()} {...props}>
                  {children}
                </code>
              );
            }

            return (
              <pre className="code-block-shell">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
