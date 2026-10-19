// Emulador de Meta Quest 3 (IWER) para iterar desde la PC sin visor. Solo en localhost.
//
// @react-three/xr trae su propio inyector, pero con iwer ≥ 2.6 no se instala en Chrome de
// escritorio: navigator.xr existe aunque no haya visor, e IWER exige `forceInstall`.
// Solo en desarrollo: en el build de producción la rama se elimina y iwer no se empaqueta.
export async function emularQuestEnLocalhost(): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return false;
  if (typeof window === "undefined" || window.location.hostname !== "localhost") return false;
  const xr = navigator.xr;
  if (xr) {
    const [ar, vr] = await Promise.all([
      xr.isSessionSupported("immersive-ar").catch(() => false),
      xr.isSessionSupported("immersive-vr").catch(() => false),
    ]);
    if (ar || vr) return false; // hay un visor real (p. ej. Quest Link)
  }
  const [{ XRDevice, metaQuest3 }, { DevUI }, { SyntheticEnvironmentModule }] = await Promise.all([
    import("iwer"),
    import("@iwer/devui"),
    import("@iwer/sem"),
  ]);
  const device = new XRDevice(metaQuest3);
  device.installRuntime({ forceInstall: true });
  device.installDevUI(DevUI);
  // Entorno sintético: simula el passthrough de una oficina, con planos para el hit-test.
  device.installSEM(SyntheticEnvironmentModule);
  void device.sem?.loadDefaultEnvironment("office_small");
  return true;
}
