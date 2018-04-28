const fs = require('fs');
const url = require('url');
const path = require('path');
const http = require('http');

// 常见静态文件格式
const mime = {
    "html": "text/html",
    "css": "text/css",
    "js": "text/javascript",
    "json": "application/json",
    "gif": "image/gif",
    "ico": "image/x-icon",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "png": "image/png"
}
const app = {};
app.routes = [];
let _static = '.';
// 命令集合
const methods = ['get', 'post', 'put', 'delete', 'options', 'all'];
// 实现路由池
methods.forEach((method) => {
    app[method] = (path, fn) => {
        routes.push({method, path, fn});
    }
});

// 使用generator函数实现惰性求值
const lazy = function* (arr) {
    yield* arr;
}

// 遍历路由池
const passRouter = (routes, method, path) => (req, res) => {
    const lazyRoutes = lazy(routes);
    (function next() {
        // 当前遍历状态
        const it = lazyRoutes.next().value;
        if (!it) {
            // 已经遍历了所有路由 停止遍历
            res.end(`Cannot ${method} ${path}`);
            return;
        } else if (it.method === 'use' && (it.path === '/' || it.path === path || path.startsWith(it.path.concat('/')))) {
            // 匹配到中间件
            it.fn(req, res, next);
        } else if ((it.method === method || it.method === 'all') && (it.path === path || it.path === "*")) {
            // 匹配到路由
            it.fn(req, res);
        } else {
            // 继续匹配
            next();
        }
    })()
}

// 处理静态文件函数
function handleStatic(res, pathName, ext) {
    fs.exists(pathName, (exists) => {
        if (!exists) {
            res.writeHead(404, {'Content-Type': 'text/plain'});
            res.write('The request url ' + pathName + ' was not found on this server');
            res.end();
        } else {
            fs.readFile(pathName, (err, file) => {
                if (err) {
                    res.writeHead(500, {'Cotent-Type': 'text/plain'});
                    res.end(err)
                } else {
                    const ContentType = mime[ext] || 'text/plain';
                    res.writeHead(200, {'Cotent-Type': ContentType});
                    res.write(file);
                    res.end();
                }
            })
        }
    })
}

app.listen = (port, host, callback) => {
    http.createServer((req, res) => {
        // 获取请求的方法
        const method = req.method.toLowerCase()
        // 解析url
        const urlObj = url.parse(req.url, true)
        // 获取path部分
        const pathName = urlObj.pathname
        // 获取后缀
        const ext = path.extname(pathName).slice(1)
        // 若有后缀 则是静态文件
        if (ext) {
            handleStatic(res, _static + pathName, ext)
        } else {
            // 遍历路由池
            passRouter(app.routes, method, pathName)(req, res)
        }
    }).listen(port, host, ()=>{
        console.log(`server start at http://${host}:${port}`)
    });
};

app.listen('8100', '127.0.0.1')