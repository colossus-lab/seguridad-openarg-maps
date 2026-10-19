export default function Cargando({ texto }: { texto: string }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#06090F]">
      <div className="flex flex-col items-center gap-3">
        <span className="eyebrow text-[#74ACDF]">Colossus Lab · Maqueta 3D</span>
        <span className="text-sm text-white/70">{texto}</span>
      </div>
    </div>
  );
}
