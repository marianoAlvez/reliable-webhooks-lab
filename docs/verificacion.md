# Fuentes y verificación técnica

Consulta: 2026-11-11. Fuentes primarias utilizadas para contrastar API/validación/documentación:

- [NestJS Raw Body](https://docs.nestjs.com/faq/raw-body): acceso al cuerpo original y `useBodyParser` respetando `rawBody`.
- [NestJS Validation](https://docs.nestjs.com/techniques/validation): ValidationPipe, whitelist, forbidNonWhitelisted y transformación de DTO.
- [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction): DocumentBuilder, createDocument y publicación del contrato.
- [Node.js SQLite](https://nodejs.org/api/sqlite.html): módulo SQLite nativo. La documentación principal puede corresponder a una versión posterior; el uso concreto de `DatabaseSync` se compiló y ejecutó con Node 24.22.1.
- [actions/checkout](https://github.com/actions/checkout) y [actions/setup-node](https://github.com/actions/setup-node): configuración CI con Node 24 y permiso `contents: read`. El workflow fija los commits de las etiquetas v7 consultadas; no solicita secretos adicionales ni persiste credenciales Git.

Dependencias resueltas en lockfile: NestJS 11.2.9, Swagger 11.4.8, TypeScript 5.9.3. Node usado en validación: 24.22.1. El lockfile es la referencia reproducible; `npm ci` respeta esas resoluciones.

Validación local realizada: compilación estricta TypeScript y 13 tests/subtests del runner Node (incluido el test contenedor HTTP), todos correctos. Siete casos de persistencia/reintentos y cinco subcasos HTTP dentro de un caso contenedor. Los tests HTTP fueron ejecutados con permiso de loopback porque el sandbox inicial rechazó conexiones con EACCES; ese fallo de entorno no fue contado como validación funcional.

Smoke del script `scripts/demo.mjs` contra la API en 127.0.0.1:4311: recepción nueva, duplicado reconocido, primer fallo en `pending` con un intento y recuperación a `delivered` con dos intentos. El script finalizó sin error y mostró historial `failed` seguido de `succeeded`. No se conectó a receptores externos.

`npm audit --omit=dev` informó cero vulnerabilidades conocidas en dependencias de producción en esta consulta. Es un resultado del registro en esa fecha; no certifica ausencia de defectos ni sustituye auditoría de seguridad.

No se midieron cargas, disponibilidad, corte de energía, comportamiento multi-proceso ni integración con receptores externos. No hay código ni datos de clientes. Los resultados de test no se presentan como métricas laborales.

El workflow `.github/workflows/ci.yml` instala desde lockfile y ejecuta `npm test` (incluye build). Su presencia no constituye evidencia de un run remoto exitoso: ese resultado debe comprobarse después de publicar.
