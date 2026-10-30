import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

export async function renderMarkdown(source: string) {
  const rendered = await remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: true })
    .process(source);

  return String(rendered);
}
