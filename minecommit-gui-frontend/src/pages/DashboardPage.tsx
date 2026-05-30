import { ActivityGraph } from "@/components/activity-graph"
import * as React from "react"
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
} from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const pieChartData = [
  { tag: "save", space: 413.88, fill: "var(--color-save)" },
  { tag: "git", space: 388.54, fill: "var(--color-git)" },
]

const pieChartConfig = {
  total: {
    label: "MiB",
  },
  save: {
    label: "存档",
    color: "var(--chart-1)",
  },
  git: {
    label: "Git仓库",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

const lineChartData = [
  { commit: "70edc4cb", save: 231.84, git: 210.48 },
  { commit: "34e5080f", save: 235.96, git: 229.31 },
  { commit: "1ae16ce9", save: 283.18, git: 245.05 },
  { commit: "a0be5c69", save: 368.39, git: 311.12 },
  { commit: "f130a04d", save: 389.37, git: 357.98 },
  { commit: "fedaab7d", save: 400.11, git: 388.54 },
]

const lineChartConfig = {
  save: {
    label: "存档",
    color: "var(--chart-1)",
  },
  git: {
    label: "Git仓库",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function ChartLineLabel() {
  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle>历史空间占用</CardTitle>
        <CardDescription>
          每次提交时存档和 Git 仓库大小（以 MiB 记）
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={lineChartConfig} className="max-h-62.5 w-full">
          <LineChart
            accessibilityLayer
            data={lineChartData}
            margin={{
              top: 20,
              left: 30,
              right: 20,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="commit"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Line
              dataKey="save"
              type="natural"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={{
                fill: "var(--chart-1)",
              }}
              activeDot={{
                r: 6,
              }}
            />
            <Line
              dataKey="git"
              type="natural"
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={{
                fill: "var(--chart-2)",
              }}
              activeDot={{
                r: 6,
              }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function ChartPieDonutText() {
  const totalSpace = React.useMemo(() => {
    return pieChartData.reduce((acc, curr) => acc + curr.space, 0)
  }, [])

  return (
    <Card className="flex w-96 flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>当前空间占用</CardTitle>
        <CardDescription>存档和 Git 仓库大小（以 MiB 记）</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={pieChartConfig}
          className="mx-auto aspect-square max-h-62.5"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={pieChartData}
              dataKey="space"
              nameKey="tag"
              innerRadius={60}
              strokeWidth={5}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-3xl font-bold"
                        >
                          {totalSpace.toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground"
                        >
                          MiB
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

const contributonData = [
  { date: "2026-05-11", count: 5 },
  { date: "2026-05-12", count: 5 },
  { date: "2026-05-13", count: 1 },
  { date: "2026-05-14", count: 5 },
  { date: "2026-05-15", count: 1 },
  { date: "2026-05-16", count: 0 },
  { date: "2026-05-17", count: 3 },
  { date: "2026-05-18", count: 5 },
  { date: "2026-05-19", count: 0 },
  { date: "2026-05-20", count: 2 },
  { date: "2026-05-21", count: 4 },
  { date: "2026-05-22", count: 3 },
  { date: "2026-05-23", count: 0 },
  { date: "2026-05-24", count: 3 },
  { date: "2026-05-25", count: 3 },
  { date: "2026-05-26", count: 5 },
  { date: "2026-05-27", count: 0 },
  { date: "2026-05-28", count: 5 },
  { date: "2026-05-29", count: 0 },
  { date: "2026-05-30", count: 5 },
]

function CardActivityGraph() {
  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>活动热点图</CardTitle>
        <CardDescription>每个格子颜色表示当天的工作量</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ActivityGraph
          data={contributonData}
          colorScale={[
            "bg-chart-1 dark:bg-chart-5",
            "bg-chart-2 dark:bg-chart-4",
            "bg-chart-3 dark:bg-chart-3",
            "bg-chart-4 dark:bg-chart-2",
            "bg-chart-5 dark:bg-chart-1",
          ]}
          blockRadius={4}
        />
      </CardContent>
    </Card>
  )
}
export function DashboardPage() {
  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <div className="flex flex-row gap-4">
        <ChartPieDonutText />
        <ChartLineLabel />
      </div>
      <CardActivityGraph />
    </div>
  )
}
