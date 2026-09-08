import UIKit
import Capacitor
import SendIntentPlugin

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    let store = ShareStore.store

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url.
        let success = ApplicationDelegateProxy.shared.application(app, open: url, options: options)

        // SendIntent URL Parameter verarbeiten (für Share Extension & Custom Schemes)
        if let components = NSURLComponents(url: url, resolvingAgainstBaseURL: true),
           let params = components.queryItems {
            let titles = params.filter { $0.name == "title" }
            let descriptions = params.filter { $0.name == "description" }
            let types = params.filter { $0.name == "type" }
            let urls = params.filter { $0.name == "url" }

            if titles.count > 0 || urls.count > 0 || descriptions.count > 0 {
                store.shareItems.removeAll()
                let count = max(titles.count, max(urls.count, descriptions.count))
                for index in 0..<count {
                    var shareItem: JSObject = JSObject()
                    if index < titles.count { shareItem["title"] = titles[index].value ?? "" }
                    if index < descriptions.count { shareItem["description"] = descriptions[index].value ?? "" }
                    if index < types.count { shareItem["type"] = types[index].value ?? "" }
                    if index < urls.count { shareItem["url"] = urls[index].value ?? "" }
                    store.shareItems.append(shareItem)
                }
                store.processed = false
                NotificationCenter.default.post(name: Notification.Name("triggerSendIntent"), object: nil)
            }
        }

        return success
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
