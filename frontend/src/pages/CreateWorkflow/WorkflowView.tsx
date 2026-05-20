import { useState, useEffect } from "react"
import Editor from "@monaco-editor/react"
import { PlugZap, Play, Code2, Palette, Type, AlertTriangle, CheckCircle, X, HelpCircle, Plus, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IntegrationsPanel } from "./components/IntegrationsPanel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { executeWorkflow } from "@/lib/workflow-validator"
import type { ValidationError, LogEntry, TriggerConfig } from "@/lib/workflow-validator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SyntaxGuide } from "./components/SyntaxGuide"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import React from "react"

interface WorkflowViewProps {
    initialScript: string;
    onUpdate: (script: string) => void;
}

const AVAILABLE_INTEGRATIONS = [
    { id: 'slack', name: 'Slack', events: ['message', 'channel_created', 'member_joined'] },
    { id: 'github', name: 'GitHub', events: ['push', 'pull_request', 'issue_created'] },
    { id: 'salesforce', name: 'Salesforce', events: ['new_lead', 'opportunity_created', 'deal_closed'] },
    { id: 'linkedin', name: 'LinkedIn', events: ['resume', 'profile_viewed', 'connection'] },
    { id: 'notion', name: 'Notion', events: ['page_updated', 'database_updated'] },
    { id: 'zapier', name: 'Zapier', events: ['webhook', 'scheduled'] }
]

const TEMPLATES = [
    {
        name: "LinkedIn Resume Screening",
        code: `export default async (context) => {
  // Extract key information
  const parsed = await ai.extract({
    prompt: "Extract full name, phone, work experience, summary of resume",
    input: context.resume
  });

  // Conduct automated interview
  const conversationData = await ai.call(
    parsed.phone,
    { script: "perform a screen interview for junior .net positions" }
  );

  // Generate and send summary
  const summary = await ai.summarize(conversationData);
  await email.send("hr@company.com", summary);
}`
    },
    {
        name: "Slack Support Bot",
        code: `export default async (context) => {
  // Classify the intent of the message
  const intent = await ai.classify(
    context.text, 
    ["question", "complaint", "feedback"]
  );

  if (intent === "question") {
    const answer = await knowledge_base.query(context.text);
    await slack.reply(context.channel, answer);
  } else if (intent === "complaint") {
    const ticket = await zendesk.create_ticket({
      title: context.text,
      priority: "high",
      customer: context.user
    });
    await slack.reply(context.channel, \`Created support ticket: \${ticket.id}\`);
  }
}`
    },
    {
        name: "Data Processor",
        code: `export default async (context) => {
  const count = await db.get("view_counter") ?? 0;
  await db.set("view_counter", count + 1);

  return {
    views: count + 1,
    message: \`This workflow has been executed \${count + 1} times\`
  };
}`
    },
    {
        name: "Sales Lead Processing",
        code: `export default async (context) => {
  const enriched = await clearbit.enrich_company(context.company);
  const score = await ai.predict_score(enriched, { model: "lead_scoring" });

  if (score > 0.7) {
    await slack.send_message("sales-team", \`Hot lead: \${context.name} (score: \${score})\`);
    await email.send_template("sales_intro", { to: context.email });
  }
}`
    }
]

const EDITOR_THEMES = [
    { name: "Light", value: "vs" },
    { name: "Dark", value: "vs-dark" },
    { name: "High Contrast", value: "hc-black" }
]

const EDITOR_FONTS = [
    { name: "Fira Code", value: "'Fira Code', monospace" },
    { name: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
    { name: "Source Code Pro", value: "'Source Code Pro', monospace" },
    { name: "Monaco", value: "Monaco, monospace" }
]

const OptionsEditor = ({ options = {}, onChange }: { 
    options: Record<string, any>; 
    onChange: (options: Record<string, any>) => void;
}) => {
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');

    const addOption = () => {
        if (newKey.trim()) {
            onChange({ ...options, [newKey.trim()]: newValue });
            setNewKey('');
            setNewValue('');
        }
    };

    const removeOption = (key: string) => {
        const updatedOptions = { ...options };
        delete updatedOptions[key];
        onChange(updatedOptions);
    };

    return (
        <div className="space-y-3">      
            {Object.entries(options).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between bg-muted rounded-md p-2 text-sm">
                    <div>
                        <span className="font-mono text-xs text-blue-500">{key}</span>
                        <span className="mx-2">:</span>
                        <span className="font-mono text-xs">{String(value)}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeOption(key)}>
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            ))}
            <div className="flex space-x-2">
                <Input className="flex-1 h-8 text-xs" placeholder="Key" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
                <Input className="flex-1 h-8 text-xs" placeholder="Value" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
                <Button variant="outline" size="sm" className="h-8 px-2" onClick={addOption} disabled={!newKey.trim()}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
            </div>
        </div>
    );
};

export function WorkflowView({ initialScript, onUpdate }: WorkflowViewProps) {
    const [code, setCode] = useState(initialScript || TEMPLATES[0].code)
    const [theme, setTheme] = useState("vs")
    const [font, setFont] = useState(EDITOR_FONTS[0].value)
    const [isRunning, setIsRunning] = useState(false)
    const [isResultVisible, setIsResultVisible] = useState(false)
    const [isSyntaxGuideOpen, setIsSyntaxGuideOpen] = useState(false)
    const [showOptions, setShowOptions] = useState(false)
    const [validationResult, setValidationResult] = useState<{
        isValid: boolean;
        errors: ValidationError[];
        logs: LogEntry[];
    } | null>(null)
    
    const [triggerConfig, setTriggerConfig] = useState<TriggerConfig>({
        integration: AVAILABLE_INTEGRATIONS[0].id,
        event: AVAILABLE_INTEGRATIONS[0].events[0],
        options: {}
    })

    useEffect(() => { onUpdate(code) }, [code, onUpdate])

    const handleCodeChange = (value: string | undefined) => {
        setCode(value || "");
        if (validationResult) {
            setValidationResult(null);
            setIsResultVisible(false);
        }
    }

    const handleTemplateChange = (templateName: string) => {
        const template = TEMPLATES.find(t => t.name === templateName);
        if (template) {
            setCode(template.code);
            setValidationResult(null);
            setIsResultVisible(false);
        }
    }

    const handleTestScript = async () => {
        setIsRunning(true);
        setIsResultVisible(true);
        try {
            const result = await executeWorkflow(code, triggerConfig);
            setValidationResult(result);
        } catch (error) {
            setValidationResult({
                isValid: false,
                errors: [{ line: 0, message: 'Runtime execution failed', type: 'runtime' }],
                logs: [{ type: 'error', message: 'Test execution failed', timestamp: Date.now() }]
            });
        } finally {
            setIsRunning(false);
        }
    }

    const currentIntegration = AVAILABLE_INTEGRATIONS.find(i => i.id === triggerConfig.integration);

    return (
        <div className="h-full flex flex-col bg-background">
            <header className="flex items-center justify-between px-4 h-14 border-b">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <PlugZap className="w-5 h-5 text-yellow-500" />
                        <h1 className="font-medium">Workflow Editor</h1>
                    </div>
                    <Select onValueChange={handleTemplateChange}>
                        <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Templates" /></SelectTrigger>
                        <SelectContent>{TEMPLATES.map(t => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={theme} onValueChange={setTheme}>
                        <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{EDITOR_THEMES.map(t => <SelectItem key={t.value} value={t.value}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => setIsSyntaxGuideOpen(true)}><HelpCircle className="h-4 w-4" /></Button>
                </div>
                <Button onClick={handleTestScript} disabled={isRunning} className="bg-primary text-primary-foreground">
                    <Play className="w-4 h-4 mr-2" /> {isRunning ? 'Running...' : 'Run Test'}
                </Button>
            </header>

            <div className="flex-1 flex overflow-hidden">
                <div className={`flex-1 flex flex-col ${isResultVisible ? 'w-[60%]' : 'w-full'}`}>
                    <div className="p-4 border-b bg-muted/30">
                        <Card className="border-none shadow-none bg-transparent">
                            <div className="flex items-center gap-4">
                                <Select value={triggerConfig.integration} onValueChange={(v) => setTriggerConfig({...triggerConfig, integration: v, event: AVAILABLE_INTEGRATIONS.find(i=>i.id===v)?.events[0] || ''})}>
                                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>{AVAILABLE_INTEGRATIONS.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={triggerConfig.event} onValueChange={(v) => setTriggerConfig({...triggerConfig, event: v})}>
                                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>{currentIntegration?.events.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                                </Select>
                                <Button variant="outline" size="sm" onClick={() => setShowOptions(!showOptions)}><Settings className="h-4 w-4 mr-2" /> Config</Button>
                            </div>
                            {showOptions && <div className="mt-4 p-3 border rounded-lg bg-background"><OptionsEditor options={triggerConfig.options || {}} onChange={(o) => setTriggerConfig({...triggerConfig, options: o})} /></div>}
                        </Card>
                    </div>
                    <Editor height="100%" defaultLanguage="javascript" theme={theme} value={code} onChange={handleCodeChange} options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: font, automaticLayout: true, padding: { top: 20 } }} />
                </div>

                {isResultVisible && (
                    <div className="border-l w-[40%] flex flex-col bg-muted/10">
                        <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
                            <span className="text-sm font-semibold">Console Output</span>
                            <Button variant="ghost" size="sm" onClick={() => setIsResultVisible(false)}><X className="h-4 w-4" /></Button>
                        </div>
                        <Tabs defaultValue="logs" className="flex-1 flex flex-col">
                            <TabsList className="m-2"><TabsTrigger value="logs" className="flex-1">Logs</TabsTrigger><TabsTrigger value="errors" className="flex-1">Errors ({validationResult?.errors.length || 0})</TabsTrigger></TabsList>
                            <TabsContent value="logs" className="flex-1 overflow-hidden"><ScrollArea className="h-full p-4 font-mono text-xs">{validationResult?.logs.map((l, i) => <div key={i} className="mb-1"><span className="opacity-50 mr-2">[{new Date(l.timestamp).toLocaleTimeString()}]</span><span className={l.type === 'error' ? 'text-red-500' : 'text-green-500'}>{l.message}</span></div>)}</ScrollArea></TabsContent>
                            <TabsContent value="errors" className="flex-1 overflow-hidden"><ScrollArea className="h-full p-4">{validationResult?.errors.map((e, i) => <Alert key={i} variant="destructive" className="mb-2"><AlertTitle>Line {e.line}: {e.type}</AlertTitle><AlertDescription>{e.message}</AlertDescription></Alert>)}</ScrollArea></TabsContent>
                        </Tabs>
                    </div>
                )}
            </div>

            <Dialog open={isSyntaxGuideOpen} onOpenChange={setIsSyntaxGuideOpen}>
                <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>API Reference</DialogTitle></DialogHeader><SyntaxGuide /></DialogContent>
            </Dialog>
        </div>
    )
}
