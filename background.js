// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background收到消息:', message);
    
    if (message.type === 'SHEFFIELD_USER_INFO') {
        // 存储用户信息，但只有当包含实际用户数据时才覆盖
        const hasRealUserData = message.data.personID || message.data.firstname || message.data.surname || message.data.email || message.data.serviceUsername;
        
        if (hasRealUserData) {
            // 合并现有数据，确保不会用“无cookie”的用户数据覆盖已有cookie
            chrome.storage.local.get(['bristolUserInfo'], (result) => {
                const existing = result.bristolUserInfo || {};
                const mergedUserData = {
                    ...existing,
                    ...message.data,
                };
                // 如果本次消息没有携带cookie，则保留已有cookie
                if (!('cookie' in message.data) || !message.data.cookie) {
                    if (existing.cookie) mergedUserData.cookie = existing.cookie;
                }
                mergedUserData.timestamp = new Date().toISOString();
                mergedUserData.tabId = sender.tab?.id;

                chrome.storage.local.set({
                    'bristolUserInfo': mergedUserData,
                    'lastUpdated': new Date().toISOString()
                }, () => {
                    console.log('用户信息已存储(合并模式):', mergedUserData);
                    sendResponse({success: true});
                });
            });
        } else {
            // 如果只有cookie信息，更新现有的用户信息中的cookie
            chrome.storage.local.get(['bristolUserInfo'], (result) => {
                if (result.bristolUserInfo && message.data.cookie) {
                    const updatedUserData = {
                        ...result.bristolUserInfo,
                        cookie: message.data.cookie,
                        timestamp: new Date().toISOString(),
                        tabId: sender.tab?.id
                    };
                    
                    chrome.storage.local.set({
                        'bristolUserInfo': updatedUserData,
                        'lastUpdated': new Date().toISOString()
                    }, () => {
                        console.log('Cookie信息已更新到现有用户数据:', updatedUserData);
                        sendResponse({success: true});
                    });
                } else {
                    console.log('跳过存储：没有实际用户数据');
                    sendResponse({success: false, reason: 'No real user data'});
                }
            });
        }
        
        return true; // 保持消息通道开放
    }
    
    if (message.type === 'SHEFFIELD_STATUS_INFO') {
        // 存储状态信息
        const statusData = {
            ...message.data,
            timestamp: new Date().toISOString(),
            tabId: sender.tab?.id
        };
        
        chrome.storage.local.set({
            'bristolStatus': statusData,
            'lastStatusCheck': new Date().toISOString()
        }, () => {
            console.log('状态信息已存储:', statusData);
            sendResponse({success: true});
        });
        
        return true; // 保持消息通道开放
    }
    
    // 处理来自content script的脚本注入请求
    if (message.type === 'INJECT_SCRIPT') {
        // 使用chrome.scripting API在主世界中执行脚本
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            world: 'MAIN',
            func: function() {
                // 页面级hook脚本
                const TARGET_PATHS = ['/campusm/sso/ldap', '/campusm/setupuser', '/sso/ldap', '/sso/state'];
                
                function isTargetURL(url) {
                    if (!url) return false;
                    const urlStr = typeof url === 'string' ? url : (url.url || '');
                    return TARGET_PATHS.some(path => urlStr.includes(path));
                }
                
                function extractAndSendData(responseText, url, requestHeaders) {
                    console.log('[Sheffield Plugin] 处理响应:', url, responseText);
                    console.log('[Sheffield Plugin] 请求头信息:', requestHeaders);
                    
                    try {
                        const data = JSON.parse(responseText);
                        console.log('[Sheffield Plugin] 解析的数据:', data);
                        
                        // 提取cookie信息
                        let cookieInfo = null;
                        if (requestHeaders && requestHeaders.cookie) {
                            cookieInfo = requestHeaders.cookie;
                            console.log('[Sheffield Plugin] 提取到Cookie:', cookieInfo);
                        }
                        
                        // 提取用户信息 (Sheffield使用 serviceUsername_3577)
                        const userInfo = {
                            personID: data.personID || data.personId || (data.authUserInfo && data.authUserInfo.personId) || data.person_id,
                            firstname: data.firstname || data.firstName || data.first_name,
                            surname: data.surname || data.lastName || data.last_name,
                            email: data.email || data.emailAddress || data.email_address,
                            serviceUsername: data.serviceUsername_3577 || data.serviceUsername || data.username || data.user_name,
                            cookie: cookieInfo // 添加cookie信息
                        };
                        
                        const hasUserInfo = Object.values(userInfo).some(v => v !== undefined && v !== null && v !== '');
                        
                        if (hasUserInfo) {
                            console.log('[Sheffield Plugin] 发送用户信息:', userInfo);
                            window.postMessage({
                                source: 'sheffield-ext',
                                type: 'SHEFFIELD_USER_INFO',
                                data: userInfo
                            }, '*');
                        } else if (data.orgCode) {
                            console.log('[Sheffield Plugin] 发送状态信息:', data.orgCode);
                            window.postMessage({
                                source: 'sheffield-ext',
                                type: 'SHEFFIELD_STATUS_INFO',
                                data: {
                                    orgCode: data.orgCode,
                                    status: 'authenticated',
                                    timestamp: new Date().toISOString(),
                                    message: '已检测到Sheffield University认证状态',
                                    cookie: cookieInfo // 添加cookie信息
                                }
                            }, '*');
                        }
                        } catch (e) {
                            console.error('[Sheffield Plugin] 解析响应失败:', e);
                        }
                    }
                    
                    // Hook fetch
                    if (!window._sheffieldFetchHooked) {
                    const originalFetch = window.fetch;
                    window.fetch = function(...args) {
                        const url = args[0];
                        const options = args[1] || {};
                        console.log('[Sheffield Plugin] Fetch请求:', url);
                        
                        return originalFetch.apply(this, args).then(response => {
                            if (isTargetURL(url)) {
                                console.log('[Sheffield Plugin] 拦截到目标fetch请求:', url);
                                
                                // 获取请求头中的cookie
                                const requestHeaders = {
                                    cookie: document.cookie || options.headers?.cookie || options.headers?.Cookie
                                };
                                
                                const clonedResponse = response.clone();
                                clonedResponse.text().then(text => {
                                    extractAndSendData(text, url, requestHeaders);
                                }).catch(e => console.error('[Sheffield Plugin] 读取fetch响应失败:', e));
                            }
                            return response;
                        });
                    };
                    window._sheffieldFetchHooked = true;
                    console.log('[Sheffield Plugin] Fetch hook已安装');
                }
                
                // Hook XMLHttpRequest
                if (!window._sheffieldXHRHooked) {
                    const OriginalXHR = window.XMLHttpRequest;
                    window.XMLHttpRequest = function() {
                        const xhr = new OriginalXHR();
                        const originalOpen = xhr.open;
                        const originalSend = xhr.send;
                        const originalSetRequestHeader = xhr.setRequestHeader;
                        
                        // 存储请求头信息
                        xhr._sheffield_headers = {};
                        
                        xhr.open = function(method, url, ...rest) {
                            this._sheffield_url = url;
                            console.log('[Sheffield Plugin] XHR请求:', method, url);
                            return originalOpen.call(this, method, url, ...rest);
                        };
                        
                        xhr.setRequestHeader = function(name, value) {
                            this._sheffield_headers[name.toLowerCase()] = value;
                            return originalSetRequestHeader.call(this, name, value);
                        };
                        
                        xhr.send = function(...args) {
                            if (isTargetURL(this._sheffield_url)) {
                                console.log('[Sheffield Plugin] 拦截到目标XHR请求:', this._sheffield_url);
                                
                                this.addEventListener('load', () => {
                                    console.log('[Sheffield Plugin] XHR响应状态:', this.status);
                                    console.log('[Sheffield Plugin] XHR响应文本:', this.responseText);
                                    
                                    // 获取cookie信息
                                    const requestHeaders = {
                                        cookie: document.cookie || this._sheffield_headers.cookie
                                    };
                                    
                                    extractAndSendData(this.responseText, this._sheffield_url, requestHeaders);
                                });
                            }
                            return originalSend.apply(this, args);
                        };
                        
                        return xhr;
                    };
                    window._sheffieldXHRHooked = true;
                    console.log('[Sheffield Plugin] XHR hook已安装');
                }
                
                console.log('[Sheffield Plugin] 页面级hook脚本通过chrome.scripting安装完成');
            }
        }).then(() => {
            console.log('脚本注入成功');
            sendResponse({ success: true });
        }).catch((error) => {
            console.error('脚本注入失败:', error);
            sendResponse({ success: false, error: error.message });
        });
        
        return true; // 保持消息通道开放
    }
});

// 监听网络请求（作为备用方案）
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    console.log('检测到Sheffield SSO状态请求:', details.url);
  },
  {urls: ["https://i.sheffield.ac.uk/campusm/sso/ldap/*", "https://*.sheffield.ac.uk/*/sso/*"]},
  ["requestBody"]
);

// 插件安装时的初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('Sheffield 提前签到助手插件已安装');
  
  // 清除之前的数据（可选）
  // chrome.storage.local.clear();
});
