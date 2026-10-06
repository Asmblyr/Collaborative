try {
  await Promise.all(
    [
      `http://127.0.0.1:${process.env.CORE_PORT ?? 3001}/ready`,
      `http://127.0.0.1:${process.env.PORT ?? 3000}/login`,
    ].map(async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      await response.body?.cancel();
      if (!response.ok) {
        throw new Error("Service is not ready");
      }
    }),
  );
} catch {
  console.error("UI or Core is not ready");
  process.exitCode = 1;
}
