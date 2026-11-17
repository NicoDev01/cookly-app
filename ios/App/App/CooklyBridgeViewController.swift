import Capacitor
import UIKit

/// Wie CAPBridgeViewController, registriert zusätzlich die app-eigenen Plugins.
class CooklyBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ShareAuthPlugin())
    }
}
