import { useState } from "react";
import type { KlineResponse } from "./types";
import Providers from "./components/Providers";
import Equity from "./components/Equity";
import MarketExplorer from "./components/MarketExplorer";
import CandleChart from "./components/CandleChart";
import CandleTable from "./components/CandleTable";
import Agents from "./components/Agents";
import Datasets from "./components/Datasets";
import Logs from "./components/Logs";
import News from "./components/News";
import Opportunities from "./components/Opportunities";
import Backtest from "./components/Backtest";
import Calibration from "./components/Calibration";
import RugCheck from "./components/RugCheck";
import Sizer from "./components/Sizer";
import Executer from "./components/Executer";
import SystemLog from "./components/SystemLog";
import { cardCls } from "./ui";

export default function App() {
  const [data, setData] = useState<KlineResponse | null>(null);

  return (
    <div className="min-h-screen">
      <header className="px-6 py-8 text-center">
        <h1 className="text-2xl font-bold text-slate-100">Crypto Signal Data Engine</h1>
        <p className="mt-1 text-sm text-slate-400">
          Multi-provider klines · SQLite storage · live WebSocket feed
        </p>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 pb-16">
        <Providers />

        <Equity />

        <RugCheck />

        <section className={cardCls}>
          <MarketExplorer data={data} onData={setData} />
          <div className="mt-4">
            <CandleChart candles={data?.candles ?? []} />
          </div>
          <div className="mt-4">
            <CandleTable candles={data?.candles ?? []} />
          </div>
        </section>

        <Opportunities />

        <Backtest />

        <Calibration />

        <Sizer />

        <Executer />

        <News />

        <div className="grid gap-5 lg:grid-cols-2">
          <Agents />
          <Datasets onOpen={setData} />
        </div>

        <Logs />

        <SystemLog />
      </main>
    </div>
  );
}
