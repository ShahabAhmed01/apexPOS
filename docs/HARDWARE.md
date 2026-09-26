# Hardware

## Supported surface today

| Device                       | State                                     | Notes                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receipt printer              | **Simulated adapter — verified in tests** | Real ESC/POS text builder (`src/main/hardware/receipt.ts`) renders a 42-column receipt; `hardware:test` prints to a job/log. No USB/serial/LAN driver wired.                                               |
| Cash drawer                  | **Simulated**                             | `hardware:openDrawer` requires `cash.no_sale` permission and is audited; no physical kick pulse.                                                                                                           |
| Barcode scanner              | **Keyboard-wedge compatible**             | Scanners type digits + Enter; the POS binds Enter on the search field to add the top match. Tests inject codes by typing (no virtual-scan channel — `hardware:virtualScan` was removed as a dead surface). |
| Customer display             | **Implemented (window, not hardware)**    | Secondary window driven by live cart state (`customer:update`).                                                                                                                                            |
| Scale / card terminal / RFID | **Absent**                                | Out of current scope.                                                                                                                                                                                      |

## Claim discipline

- Simulators are labeled simulated in the UI and produce _real artifacts_ (receipt text), but
  they are not physical-device verification.
- Physical ESC/POS printers: **adapter architecture exists; physical runtime unverified** —
  no device was available in this test environment.
- Card payments: `simulated issuer` outcomes only (approved/declined/timeout paths).
  `card_brand`/`card_last4` clearly persist `SIMULATED` so test data is never mistaken for
  real settlements.

## Wiring a real adapter

`HardwareService` in `src/main/hardware/hardwareService.ts` is the seam: implement the
device path behind it, keep IPC channels unchanged, and extend the hardware E2E to a
loopback/serial-virtual device before claiming physical support.
