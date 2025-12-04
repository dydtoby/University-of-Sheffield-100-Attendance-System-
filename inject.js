// 页面级注入脚本 - 在页面主世界中运行，用于拦截网络请求

(function() {
    'use strict';
    
    console.log('[Sheffield Plugin] 页面级hook脚本开始执行');
    
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
            
            // 检查是否是简单的布尔值或状态响应
            if (typeof data === 'boolean' || (typeof data === 'object' && Object.keys(data).length === 1 && data.orgCode)) {
                // 对于简单响应，只发送状态信息，不覆盖用户信息
                console.log('[Sheffield Plugin] 检测到简单状态响应，发送状态信息');
                window.postMessage({
                    source: 'sheffield-ext',
                    type: 'SHEFFIELD_STATUS_INFO',
                    data: {
                        orgCode: data.orgCode || 'unknown',
                        status: data === true ? 'authenticated' : 'status_check',
                        timestamp: new Date().toISOString(),
                        message: '已检测到Sheffield University认证状态',
                        cookie: cookieInfo // 添加cookie信息
                    }
                }, '*');
                return;
            }
            
            // 提取用户信息（只有当响应包含完整用户数据时） - Sheffield使用 serviceUsername_3577
            const userInfo = {
                personID: data.personID || data.personId || (data.authUserInfo && data.authUserInfo.personId) || data.person_id,
                firstname: data.firstname || data.firstName || data.first_name,
                surname: data.surname || data.lastName || data.last_name,
                email: data.email || data.emailAddress || data.email_address,
                serviceUsername: data.serviceUsername_3577 || data.serviceUsername || data.username || data.user_name,
                cookie: cookieInfo // 添加cookie信息
            };
            
            // 检查是否有实际的用户信息（排除cookie）
            const hasUserInfo = Object.entries(userInfo)
                .filter(([key]) => key !== 'cookie')
                .some(([, value]) => value !== undefined && value !== null && value !== '');
            
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
    
    // Hook XMLHttpRequest
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
    
    console.log('[Sheffield Plugin] 页面级hook脚本安装完成');
})();