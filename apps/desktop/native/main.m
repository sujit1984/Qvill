#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <arpa/inet.h>
#import <netinet/in.h>
#import <sys/socket.h>
#include <unistd.h>

static const uint16_t QVILL_PORT = 47821;

@interface QvillDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, assign) int serverSocket;
@end

@implementation QvillDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.websiteDataStore = [WKWebsiteDataStore defaultDataStore];
    self.webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    self.webView.allowsBackForwardNavigationGestures = YES;

    NSRect frame = NSMakeRect(0, 0, 1360, 880);
    self.window = [[NSWindow alloc] initWithContentRect:frame
                                              styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    self.window.title = @"Qvill";
    self.window.minSize = NSMakeSize(760, 620);
    self.window.contentView = self.webView;
    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    NSError *error = nil;
    if (![self startLocalServer:&error]) {
        NSAlert *alert = [[NSAlert alloc] init];
        alert.messageText = @"Qvill couldn’t start";
        alert.informativeText = [NSString stringWithFormat:@"The local app server could not start. Close another Qvill instance and try again.\n\n%@", error.localizedDescription ?: @"Unknown error"];
        [alert runModal];
        [NSApp terminate:nil];
        return;
    }
    [self.webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"http://127.0.0.1:47821/"]]];
}

- (BOOL)startLocalServer:(NSError **)error {
    int server = socket(AF_INET, SOCK_STREAM, 0);
    if (server < 0) {
        if (error) *error = [NSError errorWithDomain:NSPOSIXErrorDomain code:errno userInfo:nil];
        return NO;
    }
    int reuse = 1;
    setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
    struct sockaddr_in address = {0};
    address.sin_len = sizeof(address);
    address.sin_family = AF_INET;
    address.sin_port = htons(QVILL_PORT);
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(server, (struct sockaddr *)&address, sizeof(address)) != 0 || listen(server, 8) != 0) {
        int savedErrno = errno;
        close(server);
        if (error) *error = [NSError errorWithDomain:NSPOSIXErrorDomain code:savedErrno userInfo:nil];
        return NO;
    }
    self.serverSocket = server;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        while (YES) {
            int client = accept(server, NULL, NULL);
            if (client < 0) continue;
            [self serveClient:client];
        }
    });
    return YES;
}

- (void)serveClient:(int)client {
    char request[8192] = {0};
    ssize_t received = recv(client, request, sizeof(request) - 1, 0);
    if (received <= 0) { close(client); return; }
    NSString *line = [[NSString alloc] initWithBytes:request length:(NSUInteger)received encoding:NSUTF8StringEncoding];
    BOOL isHome = [line hasPrefix:@"GET / "] || [line hasPrefix:@"GET /?"];
    BOOL isLogo = [line hasPrefix:@"GET /qvill-logo.png "] || [line hasPrefix:@"GET /qvill-logo.png?"];
    NSData *body = nil;
    NSString *status = @"200 OK";
    NSString *mime = isLogo ? @"image/png" : @"text/html; charset=utf-8";
    if (isHome || isLogo) {
        NSURL *webRoot = [[[NSBundle mainBundle] resourceURL] URLByAppendingPathComponent:@"web" isDirectory:YES];
        body = [NSData dataWithContentsOfURL:[webRoot URLByAppendingPathComponent:(isLogo ? @"qvill-logo.png" : @"index.html")]];
    }
    if (!body) {
        status = @"404 Not Found";
        mime = @"text/plain; charset=utf-8";
        body = [@"Not found" dataUsingEncoding:NSUTF8StringEncoding];
    }
    NSString *headers = [NSString stringWithFormat:@"HTTP/1.1 %@\r\nContent-Type: %@\r\nContent-Length: %lu\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n", status, mime, (unsigned long)body.length];
    NSData *headerData = [headers dataUsingEncoding:NSUTF8StringEncoding];
    NSMutableData *response = [headerData mutableCopy];
    [response appendData:body];
    const uint8_t *bytes = response.bytes;
    NSUInteger remaining = response.length;
    while (remaining > 0) {
        ssize_t sent = send(client, bytes, remaining, 0);
        if (sent <= 0) break;
        bytes += sent;
        remaining -= (NSUInteger)sent;
    }
    close(client);
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }
- (void)applicationWillTerminate:(NSNotification *)notification {
    if (self.serverSocket > 0) close(self.serverSocket);
}
@end

int main(void) {
    @autoreleasepool {
        NSApplication *application = [NSApplication sharedApplication];
        QvillDelegate *delegate = [[QvillDelegate alloc] init];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
