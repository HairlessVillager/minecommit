import { CommitGraph } from "@/components/commit-graph"

const commits = [
  {
    hash: "fedaab7d",
    message: "溺尸三叉戟生产线投产",
    author: { name: "HairlessVillager" },
    date: new Date(Date.now() - 2 * 3600_000).toISOString(),
    parents: ["f130a04d"],
    refs: ["main", "HEAD"],
  },
  {
    hash: "f130a04d",
    message: "末地小黑塔落成",
    author: { name: "HairlessVillager" },
    date: new Date(Date.now() - 2 * 3600_000).toISOString(),
    parents: ["a0be5c69"],
  },
  {
    hash: "a0be5c69",
    message: "守卫者农场完工",
    author: { name: "HairlessVillager" },
    date: new Date(Date.now() - 2 * 3600_000).toISOString(),
    parents: ["1ae16ce9"],
  },
  {
    hash: "1ae16ce9",
    message: "袭击塔就绪",
    author: { name: "HairlessVillager" },
    date: new Date(Date.now() - 2 * 3600_000).toISOString(),
    parents: ["34e5080f"],
  },
  {
    hash: "34e5080f",
    message: "凋灵骷髅农场竣工",
    author: { name: "HairlessVillager" },
    date: new Date(Date.now() - 2 * 3600_000).toISOString(),
    parents: ["70edc4cb"],
  },
  {
    hash: "70edc4cb",
    message: "村民交易所开张",
    author: { name: "HairlessVillager" },
    date: new Date(Date.now() - 2 * 3600_000).toISOString(),
    parents: ["1cc78864"],
  },
  {
    hash: "1cc78864",
    message: "刷怪塔完成",
    author: { name: "HairlessVillager" },
    date: new Date(Date.now() - 2 * 3600_000).toISOString(),
    parents: ["68b6b899", "1ab47ed9"],
  },
  {
    hash: "68b6b899",
    message: "刷石机投产",
    author: { name: "HairlessVillager" },
    date: new Date(Date.now() - 2 * 3600_000).toISOString(),
    parents: ["95f0dd17"],
  },
  {
    hash: "1ab47ed9",
    message: "树场启用",
    author: { name: "hxdeng" },
    date: new Date(Date.now() - 2 * 3600_000).toISOString(),
    parents: ["95f0dd17"],
  },
  {
    hash: "95f0dd17",
    message: "刷铁机投产",
    author: { name: "HairlessVillager" },
    date: new Date(Date.now() - 2 * 3600_000).toISOString(),
    parents: [],
  },
]

function CommitGraphDemo() {
  return <CommitGraph commits={commits} />
}

export function HistoryPage() {
  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <CommitGraphDemo />
    </div>
  )
}
