# Plan de implementación y aceptación

Los siguientes incrementos están implementados en el candidato de 2026-11-11. No representan experiencia histórica de cliente.

| Incremento | Dependencia | Requisitos | Demostración / prueba |
| --- | --- | --- | --- |
| 1. Contrato + composición local | Node 24 y dependencias públicas | R1, R7 | `/health`, HMAC, DTO inválido y cuerpo excesivo en `test/http.test.ts`. |
| 2. Inbox/outbox durable | Incremento 1 y esquema local | R2, R3 | 16 solicitudes concurrentes; conflicto 409; trigger fuerza rollback; reapertura reconoce duplicado. |
| 3. Entrega simulada | Incremento 2 y puertos clock/consumer | R4 | FakeClock comprueba límite, backoff y fail-once; always-fail termina dead. |
| 4. Recuperación | Incremento 3 | R5 | Cerrar/reabrir tras claim, lease vencido, token anterior rechazado; tres abandonos agotan el máximo. |
| 5. Recorrido público | Incrementos anteriores | R6, R7 | OpenAPI responde, CLI demo verifica recepción/duplicado/fallo/éxito; README/NOTICE/seis documentos. |

## Trazabilidad de dos recorridos

Caso principal R2→R4: recepción `pending` en UI/UX → claim `processing` en Appflow → éxito `delivered` por WebhookService/consumer → outbox e historial guardados. Lo prueban concurrencia HTTP y éxito después de fallo con reloj falso.

Caso de error R3: aceptar ID nuevo → trigger sintético aborta outbox → transacción rollback → no queda evento huérfano. Lo prueba `si falla insertar outbox, la transacción también revierte el evento` en `test/reliability.test.ts`, sólo sobre archivo temporal.

## Verificación de entrega

Ejecutar `npm ci --ignore-scripts`, `npm test`, iniciar API y `npm run demo`. Revisar `/openapi.json`, carpeta de datos excluida y ausencia de clientes/secretos reales. Confirmar seis documentos y enlaces. La revisión independiente puede señalar correcciones antes de publicar el repositorio; no implica desplegar la API.

No hay decisiones bloqueantes pendientes para este alcance. Cualquier scheduler, proveedor real, exposición pública, retry administrativo, alta disponibilidad o modificación del esquema requiere otra decisión y pruebas nuevas.
