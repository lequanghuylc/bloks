// One answer holding every shape, for looking at them all at once in a test build.
import type { Message, UiNode, UiValue } from "./messages.ts";

const n = (type: string, props: Record<string, unknown> = {}): UiNode => ({ type, props: props as Record<string, UiValue> });
const series = (category: string, values: number[]) => n("Series", { category, values });

const tree = n("Card", { children: [
  n("CardHeader", { title: "Every shape", subtitle: "One answer, the whole library" }),
  n("TextContent", { text: "Plain **bold** `code` and a [link](https://example.com)." }),
  n("Callout", { variant: "info", title: "Your scale", description: "Even **1,000** JPEGs is ~0.5 GB." }),
  n("Callout", { variant: "warning", title: "Careful", description: "A caveat." }),
  n("Callout", { variant: "error", title: "Refused", description: "It failed." }),
  n("Callout", { variant: "success", title: "Done", description: "It worked." }),
  n("Callout", { variant: "neutral", title: "Note", description: "Quiet." }),
  n("MetricIndicator", { label: "Revenue", value: "$48.2k", change: "+8%", trend: "up" }),
  n("MetricIndicator", { label: "Costs", value: "$12k", change: "+3%", trend: "up", tone: "negative" }),
  n("MetricIndicator", { label: "Flat", value: "42", change: "same", trend: "flat" }),
  n("Table", { columns: [
    n("Col", { label: "Provider", data: ["Cloudflare R2", "Backblaze B2", "**Bunny**"] }),
    n("Col", { label: "Storage", data: ["$0.015/GB (10 GB free)", "~$0.006/GB", "$0.01/GB"] }),
    n("Col", { label: "Rank", data: [1, 2, 3] }),
  ] }),
  n("Separator"),
  n("BarChart", { labels: ["Jan", "Feb", "Mar"], series: [series("A", [3, 5, 2]), series("B", [4, 1, 6])] }),
  n("BarChart", { labels: ["Jan", "Feb"], variant: "stacked", series: [series("A", [3, 5]), series("B", [4, 1])] }),
  n("LineChart", { labels: ["Mon", "Tue", "Wed", "Thu"], series: [series("Up", [1, 3, 2, 5]), series("Down", [5, 4, 2, 1])] }),
  n("PieChart", { labels: ["Rent", "Food", "Fun"], values: [50, 30, 20] }),
  n("PieChart", { labels: ["A", "B"], values: [70, 30], variant: "pie" }),
  n("Steps", { items: [
    n("StepsItem", { title: "Finished", details: "All good", state: "done" }),
    n("StepsItem", { title: "Going", state: "doing" }),
    n("StepsItem", { title: "Broke", state: "failed" }),
    n("StepsItem", { title: "Later", state: "todo" }),
    n("StepsItem", { title: "No state" }),
  ] }),
  n("ListBlock", { variant: "number", items: [
    n("ListItem", { title: "Open a page", subtitle: "With a link", actionLabel: "Open", action: { actions: [{ action: "OpenUrl", args: ["https://example.com"] }] } }),
    n("ListItem", { title: "Plain row", subtitle: "No action" }),
  ] }),
  n("OptionCards", { title: "Which should we plan around?", note: "You can change later.", items: [
    n("OptionCard", { value: "r2", title: "Cloudflare R2", subtitle: "Free egress, S3 API", recommended: true }),
    n("OptionCard", { value: "b2", title: "Backblaze B2", subtitle: "Cheaper storage" }),
    n("OptionCard", { value: "v", title: "Vercel Blob", subtitle: "Easiest" }),
  ] }),
  n("Tabs", { items: [
    n("TabItem", { value: "a", trigger: "First", content: [n("TextContent", { text: "In the first tab." })] }),
    n("TabItem", { value: "b", trigger: "Second", content: [n("TextContent", { text: "In the second." })] }),
  ] }),
  n("Accordion", { items: [n("AccordionItem", { value: "a", trigger: "More detail", content: [n("TextContent", { text: "Inside." })] })] }),
  n("CodeBlock", { language: "ts", codeString: "const a = 1;\nconsole.log(a);" }),
  n("Quote", { text: "Words worth keeping.", from: "Someone", where: "Somewhere" }),
  n("TagBlock", { tags: ["one", "two"] }),
  n("Tag", { text: "Danger", variant: "danger" }),
  n("Image", { alt: "A picture", src: "https://example.com/a.png" }),
  n("Buttons", { buttons: [
    n("Button", { label: "Primary", variant: "primary" }),
    n("Button", { label: "Secondary" }),
    n("Button", { label: "Tertiary", variant: "tertiary" }),
    n("Button", { label: "Web", action: { actions: [{ action: "OpenUrl", args: ["https://example.com"] }] } }),
  ] }),
  n("Form", {
    name: "f",
    buttons: n("Buttons", { buttons: [n("Button", { label: "Send it" })] }),
    fields: [
      n("FormControl", { label: "Name", hint: "As you like it", input: n("Input", { name: "name", placeholder: "Your name", rules: { required: true } }) }),
      n("FormControl", { label: "Notes", input: n("TextArea", { name: "notes", placeholder: "Anything else", rows: 3 }) }),
      n("FormControl", { label: "Size", input: n("Select", { name: "size", placeholder: "Choose", items: [n("SelectItem", { value: "s", label: "Small" })] }) }),
      n("FormControl", { label: "Pick", input: n("RadioGroup", { name: "pick", defaultValue: "a", items: [n("RadioItem", { label: "A", description: "First", value: "a" }), n("RadioItem", { label: "B", description: "Second", value: "b" })] }) }),
      n("FormControl", { label: "Extras", input: n("CheckBoxGroup", { name: "extras", items: [n("CheckBoxItem", { label: "Wine", description: "Red", name: "wine", defaultChecked: true })] }) }),
      n("FormControl", { label: "Amount", input: n("Slider", { name: "amount", variant: "discrete", min: 0, max: 10, step: 1, defaultValue: [4] }) }),
      n("FormControl", { label: "When", input: n("DatePicker", { name: "when" }) }),
    ],
  }),
  n("Sources", { items: [{ title: "A source", url: "https://example.com/a", sourceName: "Example" }] }),
  n("FollowUpBlock", { items: [n("FollowUpItem", { text: "Show me the cheapest" }), n("FollowUpItem", { text: "Compare egress" })] }),
] });

export const FIXTURE: Message = {
  id: "fixture",
  role: "bot",
  kind: "text",
  at: Date.now(),
  text: "## A reply\n\nWords **before** the answer.\n\n- a list\n  - nested\n- [x] a task\n\n> a quote\n\n| A | B |\n|---|--:|\n| one | 1 |\n\n```openui\nroot = Card([])\n```\n\nWords after.",
  ui: [{ fence: 0, tree }],
};
