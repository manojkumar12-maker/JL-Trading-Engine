import PerpMomentum from "./components/PerpMomentum";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="px-6 py-8 text-center">
        <h1 className="text-2xl font-bold text-slate-100">Perp Momentum Engine</h1>
        <p className="mt-1 text-sm text-slate-400">
          Validated low-cap perpetuals strategy · paper trading
        </p>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 pb-16">
        <PerpMomentum />
      </main>
    </div>
  );
}
