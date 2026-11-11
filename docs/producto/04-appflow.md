# Flujos de uso

## Recepción y duplicación — R1/R2/R3

Actor: evaluador. Disparador: POST firmado. Precondición: API local iniciada.

1. El parser limita el cuerpo; el guard verifica HMAC; DTO rechaza campos inválidos/desconocidos.
2. Aplicación normaliza campos y calcula hash.
3. Transacción busca `eventId`. Si existe con igual hash, retorna el estado actual como duplicado. Si difiere, devuelve 409 y no cambia nada.
4. Para nuevo ID se guardan evento y outbox `pending` juntos. Se confirma antes del 200.
5. Si falla cualquier escritura, rollback conserva ambas tablas sin el nuevo evento.

## Entrega con fallo y recuperación — R4/R6

Actor: evaluador/script. Disparador: `POST /demo/dispatch`. Precondición: tarea vencida.

1. Transacción reclama una tarea y aumenta intento; guarda token, lease e historial `started`.
2. Consumidor simulado devuelve éxito o fallo según `deliveryMode` e intento.
3. Éxito: `delivered`, historial `succeeded`. Fallo: `pending` y próxima fecha, o `dead` al tercer intento.
4. Antes del vencimiento, otro dispatch no procesa la misma tarea.
5. El evaluador consulta estado, espera `nextAttemptAt` y repite. El lote termina tras 20 tareas o al no existir vencidas.

## Caída del worker — R5

Actor: prueba automatizada. Disparador: una tarea reclamada no se completa.

1. Antes de 30 s, la tarea permanece `processing` y no puede reclamarse.
2. Al vencer, el próximo dispatch registra `lease-expired` en el intento abandonado.
3. Si quedan intentos, otro reclamo crea un token nuevo; si ya van tres, termina `dead`.
4. La finalización tardía del token antiguo devuelve `false` y no modifica el nuevo estado.

| Desde | Evento | Hacia |
| --- | --- | --- |
| pending | Vencimiento + reclamo | processing |
| processing | Éxito con token vigente | delivered |
| processing | Fallo, intento <3 | pending |
| processing | Fallo, intento =3 | dead |
| processing | Lease vencido, intento <3 | processing con nuevo token/intento |
| processing | Lease vencido, intento =3 | dead |

`delivered` y `dead` son terminales en el MVP. Un duplicado de recepción no los reinicia.
