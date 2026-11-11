# Datos y contratos

## Contrato de entrada

`eventId`: ASCII alfanumérico/guion/guion bajo, 1–80 caracteres. `type`: `demo.created` o `demo.updated`. `payload.reference`: texto no vacío, máximo 64. `payload.message`: texto no vacío, máximo 500. `deliveryMode`: `success`, `fail-once` o `always-fail`. Todos requeridos; campos extra rechazados. JSON máximo 16 KiB.

`eventId` identifica globalmente el evento dentro de esta única base de laboratorio. No hay tenant/proveedor. Hash SHA-256 sobre serialización de campos en orden canónico; la firma HMAC es independiente y cubre el cuerpo HTTP exacto.

## Persistencia

| Entidad | Clave y campos | Integridad |
| --- | --- | --- |
| events | `event_id` PK; content_hash, payload_json, received_at | ID único; evento inmutable. |
| outbox | `event_id` PK/FK; status, attempts, due_at, lease_until, lease_token, last_error, delivered_at | Una tarea por evento; estados restringidos; intentos entre 0 y 3. |
| delivery_attempts | PK(event_id, attempt); started_at, outcome, error | N intentos por evento; outcome restringido. |

Relaciones: events 1:1 outbox; events 1:N delivery_attempts. FK habilitadas. Índice outbox(status, due_at). Todos los timestamps son enteros Unix milisegundos. Datos en `data/demo.sqlite`; SQLite WAL puede generar archivos laterales que también se excluyen de Git.

## Cambios atómicos

- Recepción nueva: INSERT events + INSERT outbox en una transacción.
- Reclamo: incremento intento + token/lease + INSERT delivery_attempts en una transacción.
- Finalización: comprobar token + actualizar estado/outbox + historial en una transacción.
- Recuperación: registrar expiración y reclamar de nuevo, o terminar `dead` si agotado.

El snapshot público incluye evento, estado, intentos, historial, nextAttemptAt, deliveredAt y lastError. No expone hash ni leaseToken. No se guarda HMAC ni secreto. Sólo hay errores sintéticos controlados, sin logs de payload.

## Acceso y límites

No existen roles ni usuarios. Cualquier proceso local puede consultar estado y despachar; recibir eventos requiere la firma de demostración. API ligada a loopback. No hay endpoint de borrado ni reset de datos. La base persiste entre ejecuciones; pruebas usan archivos temporales separados. No hay migraciones versionadas en este MVP: el esquema inicial se crea con `IF NOT EXISTS`, por lo que una futura evolución necesitaría migraciones explícitas.
