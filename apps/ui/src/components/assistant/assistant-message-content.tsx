import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AssistantMessageContent({ content }: { content: string }) {
  return <div className="min-w-0 space-y-3 text-sm leading-6 [overflow-wrap:anywhere]">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      p: ({ children }) => <p>{children}</p>,
      ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
      h1: ({ children }) => <h3 className="font-semibold">{children}</h3>,
      h2: ({ children }) => <h3 className="font-semibold">{children}</h3>,
      h3: ({ children }) => <h3 className="font-semibold">{children}</h3>,
      table: ({ children }) => <div className="max-w-full overflow-hidden rounded-lg border bg-background/40">
        <Table className="text-xs leading-5">{children}</Table></div>,
      thead: ({ children }) => <TableHeader className="bg-muted/60">{children}</TableHeader>,
      tbody: ({ children }) => <TableBody>{children}</TableBody>,
      tr: ({ children }) => <TableRow className="hover:bg-transparent">{children}</TableRow>,
      th: ({ children, style }) => <TableHead style={style} className="h-auto px-2.5 py-2 text-xs">{children}</TableHead>,
      td: ({ children, style }) => <TableCell style={style} className="max-w-56 whitespace-normal px-2.5 py-2 align-top">{children}</TableCell>,
      blockquote: ({ children }) => <blockquote className="space-y-2 border-l-2 pl-3 text-muted-foreground">{children}</blockquote>,
      pre: ({ children }) => <pre className="max-w-full overflow-x-auto rounded-lg bg-background/70 p-3 text-xs">{children}</pre>,
      code: ({ children }) => <code className="rounded bg-background/60 px-1 py-0.5 text-[0.9em]">{children}</code>,
      a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{children}</a>,
      // Model-generated URLs must not fetch remote images automatically.
      img: ({ alt }) => <span>{alt}</span>,
    }}>{content}</ReactMarkdown>
  </div>;
}
