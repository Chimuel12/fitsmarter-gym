# FitSmarter en tu iPhone

Instala la app FitSmarter en tu iPhone con tu propio Apple ID (gratis). Claude hace casi todo.

## Lo que necesitas

- Un **Mac** con **Xcode** (gratis, en la Mac App Store). Ábrelo una vez y acepta lo que pida.
- En Xcode: **Settings → Accounts → +** → inicia sesión con tu **Apple ID**.
- Tu **iPhone conectado por cable**, desbloqueado, tocando **"Confiar"** en este ordenador.
- En el iPhone: **Ajustes → Privacidad y seguridad → Modo de desarrollador → activado** (se reinicia).
- **Claude Code** en el Mac (la app de Claude, pestaña Code, o `claude` en la Terminal).

## Lo único que haces: pegar esto en Claude Code

```
Instala FitSmarter en mi iPhone. Lee primero https://raw.githubusercontent.com/Chimuel12/fitsmarter-gym/main/iphone/install.sh para ver qué hace, descárgalo y ejecútalo con bash. Si se para, dime exactamente qué tengo que hacer yo y vuelve a ejecutarlo.
```

Claude revisa el script, instala lo que falte (Node, CocoaPods), descarga FitSmarter, la firma con tu
Apple ID y la instala en el iPhone. Tarda unos 10 minutos la primera vez.

**Al terminar, en el iPhone (solo la primera vez):** Ajustes → General → VPN y gestión de
dispositivos → tu Apple ID → **Confiar**. Después abre FitSmarter.

## Se renueva sola cada semana

Apple hace que las apps instaladas con un Apple ID gratis dejen de abrir a los 7 días. Por eso,
al terminar, el script deja el Mac preparado para **volver a compilar e instalar FitSmarter solo**
(y con la versión más nueva) a partir del día 5, sin que hagas nada. Solo hace falta que:

- el **Mac esté encendido** con tu sesión abierta, y
- el **iPhone esté conectado por cable o en la misma Wi-Fi**. Para la Wi-Fi, una vez: Xcode →
  Window → Devices and Simulators → tu iPhone → **Connect via network**.

El Mac lo intenta cada 4 horas. Si a los 6 días aún no ha podido, te avisa con una notificación.
Tus datos se quedan en el teléfono. Para dejar de renovarla:
`bash ~/FitSmarter-iPhone/iphone/install.sh --stop-renew`

## Bueno saber

- Dentro de la app de iPhone, Competir usa **email y contraseña** (Google no permite su inicio de
  sesión dentro de apps). La sincronización con Google Drive se usa desde la versión web.
- ¿Sin Mac? Usa la versión web: abre **https://chimuel12.github.io/fitsmarter-gym** en Safari →
  Compartir → **Añadir a pantalla de inicio**.

## Sin Claude

```
curl -fsSL https://raw.githubusercontent.com/Chimuel12/fitsmarter-gym/main/iphone/install.sh -o install.sh
bash install.sh
```
