# Anvil Wallet — extensión de Chrome

Extensión de Chrome (Manifest V3) para trabajar con un nodo local de [Anvil](https://book.getfoundry.sh/anvil/) en `http://localhost:8545`. Deriva 10 cuentas a partir de un mnemónico, muestra sus saldos y permite enviar fondos entre ellas desde el popup.

> Proyecto de aprendizaje. Está pensado para **mnemónicos de desarrollo** (el de Anvil por defecto es público). No lo uses con claves que controlen fondos reales.

## Qué hace

- **Mnemónico cifrado con contraseña.** Se guarda en `chrome.storage.local` cifrado con AES-256-GCM. La clave se deriva de la contraseña con PBKDF2-SHA256 (600 000 iteraciones) mediante WebCrypto. La contraseña no se almacena.
- **10 cuentas HD.** Se derivan con la ruta `m/44'/60'/0'/0/i` (la misma que usa Anvil), usando ethers v6.
- **Saldos.** La lista muestra el índice, la address abreviada y el saldo en ETH de cada cuenta, con botón para actualizar.
- **Envío de fondos.** Eliges la cuenta origen, el destino (una de las cuentas o cualquier address) y la cantidad. La extensión firma la transacción con la clave derivada y la envía a Anvil. Al confirmarse muestra el hash y refresca los saldos.
- **Sesión desbloqueada.** Tras introducir la contraseña, el mnemónico queda en `chrome.storage.session` (solo en memoria, se borra al cerrar Chrome), así que no hay que escribirla cada vez que se abre el popup. El botón "Bloquear" lo borra al momento.
- **Borrado.** "Borrar mnemónico" elimina el valor cifrado guardado. Si olvidas la contraseña no hay forma de recuperarlo.

## Estructura

```
hello-extension/
├── manifest.json         # Manifest V3: permisos storage y host localhost:8545
├── popup.html            # Interfaz del popup
├── popup.js              # Cifrado, derivación de cuentas, saldos y envíos
├── ethers.umd.min.js     # ethers 6.13.4 (empaquetado: MV3 no permite JS remoto)
├── icons/                # Iconos 16, 32, 48 y 128 px
└── docs/                 # Material explicativo (ver abajo)
```

## Instalación

1. Arranca Anvil: `anvil` (escucha por defecto en el puerto 8545).
2. Abre `chrome://extensions` y activa el **Modo desarrollador**.
3. Pulsa **Cargar descomprimida** y elige esta carpeta.
4. Abre el popup, introduce el mnemónico (viene precargado el de Anvil: `test test … junk`) y una contraseña de al menos 8 caracteres.

Con el mnemónico por defecto, la cuenta #0 es `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` y empieza con 10 000 ETH.

## Permisos

| Permiso | Motivo |
| --- | --- |
| `storage` | Guardar el mnemónico cifrado y mantener la sesión desbloqueada |
| `host_permissions` `localhost:8545`, `127.0.0.1:8545` | Hablar JSON-RPC con Anvil |

## Cómo se construyó

La extensión creció en pasos:

1. **Hello World** en el popup, con icono propio generado con un script.
2. **Contador** guardado en `chrome.storage` (después se eliminó).
3. **Consulta de saldo** de una address vía `eth_getBalance` contra Anvil (primero en el puerto 8454, luego corregido a 8545).
4. **Cuentas y transferencias:** mnemónico, derivación de 10 cuentas con ethers y envío de transacciones firmadas.
5. **Cifrado del mnemónico** con contraseña (WebCrypto) y bloqueo/desbloqueo de sesión.

## Documentación incluida

Son tres páginas HTML autocontenidas (se abren en el navegador) exportadas desde artifacts de Claude:

| Carpeta | Contenido |
| --- | --- |
| [`docs/partes-extension/`](docs/partes-extension/index.html) | Animación de cómo se comunican las partes de una extensión (popup, content script, service worker, storage) y guía de seguridad sobre inyección en pestañas |
| [`docs/analisis-optimizely/`](docs/analisis-optimizely/index.html) | Análisis de lo que ofrece Optimizely y nota sobre el incidente de seguridad de noviembre de 2026 |
| [`docs/optimizely-wallet/`](docs/optimizely-wallet/index.html) | Caso didáctico: cómo un script de terceros comprometido puede cambiar direcciones cripto y qué implica para una wallet, con simulación y cuestionario |

Tienen relación con el proyecto porque una extensión de wallet comparte el mismo problema de confianza: lo que no controlas (la web, un script de terceros) puede alterar lo que ves, así que la dirección de destino hay que verificarla en un lugar que la página no pueda tocar.

## Limitaciones conocidas

- Solo funciona contra una red local; el RPC (`localhost:8545`) está fijado en `popup.js`.
- El popup se cierra al perder el foco: una transacción en curso puede quedar sin mostrar su resultado, aunque se haya enviado.
- Las transferencias no estiman ni configuran el gas manualmente; usa lo que devuelve el nodo.
