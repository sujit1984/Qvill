#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <arpa/inet.h>
#import <netinet/in.h>
#import <sys/socket.h>
#include <unistd.h>

static const uint16_t QVILL_PORT = 47821;

@interface QvillDelegate : NSObject <NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) WKWebView *pdfExportWebView;
@property(nonatomic, copy) NSString *pdfExportFilename;
@property(nonatomic, assign) int serverSocket;
@end

@implementation QvillDelegate

- (void)installEditMenu {
    NSMenu *mainMenu = [[NSMenu alloc] initWithTitle:@"Qvill"];
    NSMenuItem *editMenuItem = [[NSMenuItem alloc] initWithTitle:@"Edit" action:nil keyEquivalent:@""];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
    NSArray<NSDictionary *> *commands = @[
        @{ @"title": @"Undo", @"action": NSStringFromSelector(@selector(undo:)), @"key": @"z" },
        @{ @"title": @"Redo", @"action": NSStringFromSelector(@selector(redo:)), @"key": @"z", @"modifiers": @(NSEventModifierFlagCommand | NSEventModifierFlagShift) },
        @{ @"separator": @YES },
        @{ @"title": @"Cut", @"action": NSStringFromSelector(@selector(cut:)), @"key": @"x" },
        @{ @"title": @"Copy", @"action": NSStringFromSelector(@selector(copy:)), @"key": @"c" },
        @{ @"title": @"Paste", @"action": NSStringFromSelector(@selector(paste:)), @"key": @"v" },
        @{ @"separator": @YES },
        @{ @"title": @"Select All", @"action": NSStringFromSelector(@selector(selectAll:)), @"key": @"a" }
    ];
    for (NSDictionary *command in commands) {
        if (command[@"separator"]) {
            [editMenu addItem:[NSMenuItem separatorItem]];
            continue;
        }
        NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:command[@"title"]
                                                     action:NSSelectorFromString(command[@"action"])
                                              keyEquivalent:command[@"key"]];
        item.keyEquivalentModifierMask = command[@"modifiers"] ? [command[@"modifiers"] unsignedIntegerValue] : NSEventModifierFlagCommand;
        [editMenu addItem:item];
    }
    editMenuItem.submenu = editMenu;
    [mainMenu addItem:editMenuItem];
    NSApp.mainMenu = mainMenu;
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    [self installEditMenu];
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.websiteDataStore = [WKWebsiteDataStore defaultDataStore];
    [configuration.userContentController addScriptMessageHandler:self name:@"qvill"];
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

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:@"qvill"] || ![message.body isKindOfClass:[NSDictionary class]]) return;
    NSString *action = message.body[@"action"];
    if ([action isEqualToString:@"export-pdf"]) {
        NSString *html = message.body[@"html"];
        if (![html isKindOfClass:[NSString class]]) return;
        NSString *filename = message.body[@"filename"];
        if (![filename isKindOfClass:[NSString class]] || filename.length == 0) filename = @"Qvill export.pdf";
        self.pdfExportFilename = [filename.lastPathComponent hasSuffix:@".pdf"] ? filename.lastPathComponent : [filename.lastPathComponent stringByAppendingPathExtension:@"pdf"];
        WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
        self.pdfExportWebView = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, 612, 792) configuration:configuration];
        self.pdfExportWebView.navigationDelegate = self;
        [self.pdfExportWebView loadHTMLString:html baseURL:nil];
        return;
    }
    if (![action isEqualToString:@"print"]) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        NSPrintInfo *printInfo = [[NSPrintInfo sharedPrintInfo] copy];
        printInfo.horizontalPagination = NSPrintingPaginationModeAutomatic;
        printInfo.verticalPagination = NSPrintingPaginationModeAutomatic;
        printInfo.verticallyCentered = NO;
        NSPrintOperation *operation = [self.webView printOperationWithPrintInfo:printInfo];
        if (!operation) {
            NSAlert *alert = [[NSAlert alloc] init];
            alert.messageText = @"Printing isn’t available";
            alert.informativeText = @"Qvill couldn’t prepare this note for printing. Try again after reopening the note.";
            [alert runModal];
            return;
        }
        operation.showsPrintPanel = YES;
        operation.showsProgressPanel = YES;
        [operation runOperation];
    });
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    if (webView != self.pdfExportWebView) return;
    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.allowedContentTypes = @[UTTypePDF];
    panel.nameFieldStringValue = self.pdfExportFilename ?: @"Qvill export.pdf";
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response) {
        if (response == NSModalResponseOK) {
            NSPrintInfo *printInfo = [[NSPrintInfo sharedPrintInfo] copy];
            printInfo.horizontalPagination = NSPrintingPaginationModeAutomatic;
            printInfo.verticalPagination = NSPrintingPaginationModeAutomatic;
            printInfo.verticallyCentered = NO;
            printInfo.jobDisposition = NSPrintSaveJob;
            [printInfo setValue:panel.URL forKey:NSPrintJobSavingURL];
            NSPrintOperation *operation = [webView printOperationWithPrintInfo:printInfo];
            if (operation) {
                operation.showsPrintPanel = NO;
                operation.showsProgressPanel = YES;
                if (![operation runOperation]) {
                    NSAlert *alert = [[NSAlert alloc] init];
                    alert.messageText = @"PDF export failed";
                    alert.informativeText = @"Qvill couldn’t write the PDF file. Choose another location and try again.";
                    [alert runModal];
                }
            } else {
                NSAlert *alert = [[NSAlert alloc] init];
                alert.messageText = @"PDF export isn’t available";
                alert.informativeText = @"Qvill couldn’t prepare these pages for export. Try again after reopening the page.";
                [alert runModal];
            }
        }
        self.pdfExportWebView.navigationDelegate = nil;
        self.pdfExportWebView = nil;
        self.pdfExportFilename = nil;
    }];
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
    NSArray<NSString *> *hierarchyPaths = @[@"tree", @"branches", @"leaf", @"flower", @"fruit"];
    NSString *hierarchyAsset = nil;
    for (NSString *name in hierarchyPaths) { NSString *path = [@"/hierarchy/" stringByAppendingFormat:@"%@.png", name]; if ([line hasPrefix:[@"GET " stringByAppendingString:path]] || [line hasPrefix:[@"GET " stringByAppendingFormat:@"%@?", path]]) { hierarchyAsset = [path substringFromIndex:1]; break; } }
    BOOL isHierarchy = hierarchyAsset != nil;
    NSData *body = nil;
    NSString *status = @"200 OK";
    NSString *mime = (isLogo || isHierarchy) ? @"image/png" : @"text/html; charset=utf-8";
    if (isHome || isLogo || isHierarchy) {
        NSURL *webRoot = [[[NSBundle mainBundle] resourceURL] URLByAppendingPathComponent:@"web" isDirectory:YES];
        body = [NSData dataWithContentsOfURL:[webRoot URLByAppendingPathComponent:(isHierarchy ? hierarchyAsset : isLogo ? @"qvill-logo.png" : @"index.html")]];
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
