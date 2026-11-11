# TRD — decisiones técnicas

## Componentes

HTTP/NestJS valida DTO y firma HMAC sobre el raw body; `WebhookService` coordina recepción/despacho. Los puertos `EventStore`, `Clock` y `DeliveryConsumer` separan aplicación de persistencia, tiempo y entrega. El dominio declara evento, estados y política. SQLite y el consumidor simulado son adaptadores.

La composición vive en `src/app.ts`; `src/main.ts` sólo configura el archivo local y escucha en loopback. Tests reutilizan `createApp`, SQLite temporal o en memoria y un reloj falso. No hay ramas de negocio exclusivas de test.

## Decisiones y razones

| Decisión | Razón y límite |
| --- | --- |
| Node 24, SQLite nativo `node:sqlite` | Evita servidor DB y compilación de módulos nativos externos. Se usa `DatabaseSync`; las operaciones bloquean el event loop. |
| `BEGIN IMMEDIATE` + clave primaria | Serializa la aceptación y conserva evento/outbox en la misma transacción. Se prueba rollback y concurrencia HTTP local, no un clúster. |
| Hash canónico explícito | El orden JSON no crea falsos conflictos; cualquier cambio en campos de negocio/simulación sí devuelve 409. |
| Lease/token | Un reclamo abandonado es recuperable y una finalización anterior no pisa un nuevo reclamo. No impide que un receptor externo vea un duplicado. |
| Tres intentos, backoff de 1/2 s | Hace visible el flujo en una demo breve. No hay jitter porque no se modela una flota de workers. |
| Despacho manual de hasta 20 tareas | Evita scheduler y permite inspeccionar cada paso. No existe entrega automática. |
| HMAC y cuerpo de 16 KiB | Muestra integridad y límites. La clave de ejemplo es pública y no autentica usuarios. |

## Verificación

R1/R2 se verifican por HTTP real local; R3 con SQLite de archivo, reapertura y trigger de fallo controlado sólo en DB temporal; R4/R5 con reloj determinista y reinicio de conexión. R6 recorre OpenAPI y script CLI. Los contratos y restricciones de campo están en [esquema](05-esquema-backend.md).

## Riesgos y límites

Falta de autorización, control de abuso, firma temporal, retención y telemetría excluyen exposición pública del servicio. HMAC no ofrece anti-replay temporal. El reloj del sistema puede variar; tests usan reloj inyectado. Un receptor real requeriría deduplicar por `eventId`, timeout y categorización de fallos. No se realizan envíos reales ni se garantiza exactly-once. No se añadió licencia propia por defecto.
