# Experiencia API/CLI

## Persona y punto de entrada

El evaluador inicia la API, abre `/docs` y ejecuta `npm run demo`. No existe una interfaz visual propia; Swagger UI presenta los contratos, ejemplos y campos requeridos. No se agregan requisitos de responsive/foco fuera de la UI estándar de Swagger.

## Entrada mínima

```json
{"eventId":"demo-001","type":"demo.created","payload":{"reference":"synthetic-001","message":"Evento sintético"},"deliveryMode":"fail-once"}
```

`POST /events` requiere `Content-Type: application/json` y `x-demo-signature`. El script `scripts/sign.mjs` firma los bytes del archivo; cambiar espacios requiere otra firma. Swagger documenta el header, pero no calcula la firma por el usuario.

## Estados y mensajes

| Situación | Interacción y recuperación |
| --- | --- |
| Sin eventos | `GET /events` devuelve `[]`; enviar el ejemplo firmado. |
| Recibido | `200`, `duplicate: false`, `status: pending`, `attempts: 0`. |
| Duplicado idéntico | `200`, `duplicate: true`; consultar el estado existente. |
| ID conflictivo | `409`, «El eventId ya existe con contenido diferente.»; conservar el evento original o elegir un ID nuevo. |
| DTO inválido | `400` con campos rechazados; corregir y volver a firmar. |
| Firma incorrecta | `401`; firmar los mismos bytes con la misma clave usada por el servidor. |
| Fallo temporal | `pending` con `nextAttemptAt`; esperar y despachar otra vez. |
| Entregado | `delivered`, `deliveredAt`, historial de intentos. |
| Fallo agotado | `dead`, tres intentos; terminal en este MVP, no hay botón de retry manual. |
| No encontrado | `404`; verificar `eventId` o consultar la lista. |
| API no disponible | CLI falla; iniciar `npm start` y verificar `/health`. |

Las fechas se devuelven como Unix milisegundos. `POST /demo/dispatch` responde cantidad procesada y resultados; no espera a futuros reintentos. El script automático espera el vencimiento y afirma el resultado esperado. Consultas listadas limitan cantidad entre 1 y 100.
