import * as React from "react";
import { Link } from "react-router-dom";

import { StormRouteWordmark } from "@/brand/StormRouteWordmark";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  GlassPanel,
  Input,
  Kbd,
  NumberField,
  RiskBadge,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  Slider,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { toast } from "sonner";
import { RISK_LEVELS, RISK_SWATCH_CLASS } from "@/lib/risk";
import { useUiStore } from "@/store/uiStore";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-md font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function DesignSystemPage() {
  const themeMode = useUiStore((state) => state.themeMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const [numberValue, setNumberValue] = React.useState(32000);
  const [sliderValue, setSliderValue] = React.useState([12]);
  const [segment, setSegment] = React.useState<"auto" | "10" | "25" | "50">("auto");
  const [combo, setCombo] = React.useState("chi");
  const [selectValue, setSelectValue] = React.useState("driving");

  return (
    <div className="min-h-dvh bg-bg text-text" data-testid="design-system">
      <header className="sticky top-0 z-20 border-b border-border bg-[var(--sr-glass-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <StormRouteWordmark compact />
          <div className="flex items-center gap-2">
            <SegmentedControl
              ariaLabel="Theme mode"
              value={themeMode}
              onValueChange={(value) => setThemeMode(value)}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
            <Button asChild variant="secondary" size="sm">
              <Link to="/">App shell</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-8">
        <Section title="Brand">
          <GlassPanel className="p-6">
            <StormRouteWordmark />
          </GlassPanel>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="primary" loading>
              Loading
            </Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </div>
        </Section>

        <Section title="Inputs">
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Origin city or address" />
            <NumberField
              value={numberValue}
              onValueChange={setNumberValue}
              step={1000}
              min={0}
              max={200000}
              aria-label="Load weight pounds"
            />
            <Select value={selectValue} onValueChange={setSelectValue}>
              <SelectTrigger aria-label="Profile">
                <SelectValue placeholder="Select profile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="driving">Driving</SelectItem>
                <SelectItem value="truck">Truck (future)</SelectItem>
              </SelectContent>
            </Select>
            <Combobox
              value={combo}
              onValueChange={setCombo}
              options={[
                { value: "chi", label: "Chicago, IL" },
                { value: "den", label: "Denver, CO" },
                { value: "dal", label: "Dallas, TX" },
              ]}
              placeholder="Search cities"
            />
          </div>
        </Section>

        <Section title="Segmented control & slider">
          <SegmentedControl
            value={segment}
            onValueChange={setSegment}
            options={[
              { value: "auto", label: "Auto" },
              { value: "10", label: "10 mi" },
              { value: "25", label: "25 mi" },
              { value: "50", label: "50 mi" },
            ]}
          />
          <Slider
            value={sliderValue}
            onValueChange={setSliderValue}
            min={0}
            max={48}
            tickCount={9}
            showValue
            formatValue={(value) => `H+${value}`}
          />
        </Section>

        <Section title="Badges & risk scale">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="accent">Accent</Badge>
            <Badge variant="brand">Brand</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {RISK_LEVELS.map((level) => (
              <RiskBadge key={level} level={level} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {RISK_LEVELS.map((level) => (
              <div
                key={level}
                className="flex flex-col items-center gap-2 rounded-[var(--radius-control)] border border-border p-3"
              >
                <span className={`size-8 rounded-full ${RISK_SWATCH_CLASS[level]}`} aria-hidden />
                <span className="text-xs text-text-muted">{level}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Card, tabs, kbd, skeleton">
          <Card>
            <CardHeader>
              <CardTitle>Route summary</CardTitle>
              <CardDescription>Placeholder card for ranked options.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs defaultValue="summary">
                <TabsList>
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="weather">Weather</TabsTrigger>
                </TabsList>
                <TabsContent value="summary">
                  <p className="font-mono text-sm tabular-nums text-text-muted">
                    412.0 mi · 7h 18m
                  </p>
                </TabsContent>
                <TabsContent value="weather">
                  <Skeleton className="h-16 w-full" />
                </TabsContent>
              </Tabs>
              <p className="text-sm text-text-muted">
                Shortcut <Kbd>⌘</Kbd> <Kbd>K</Kbd>
              </p>
            </CardContent>
          </Card>
        </Section>

        <Section title="Overlay primitives">
          <div className="flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary">Tooltip</Button>
              </TooltipTrigger>
              <TooltipContent>Focus-visible friendly tip</TooltipContent>
            </Tooltip>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>How risk is calculated</DialogTitle>
                  <DialogDescription>
                    Product help icon opens the live dialog fed by GET /api/meta.
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="secondary">Sheet</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Mobile sheet</SheetTitle>
                </SheetHeader>
                <SheetBody>
                  <p className="text-sm text-text-muted">
                    Vaul-based sheet used for mobile planner chrome.
                  </p>
                </SheetBody>
              </SheetContent>
            </Sheet>

            <Button variant="primary" onClick={() => toast("StormRoute toast", { description: "Typed feedback ready." })}>
              Toast
            </Button>
          </div>
        </Section>

        <Section title="Glass panel">
          <div className="map-grid rounded-[var(--radius-panel)] p-8">
            <GlassPanel className="max-w-sm p-4">
              <p className="text-sm">Surface at 72% alpha, blur 20px, inner highlight, soft shadow.</p>
            </GlassPanel>
          </div>
        </Section>
      </main>
    </div>
  );
}
