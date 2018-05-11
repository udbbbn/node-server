const fs = require('fs');
const url = require('url');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const xml2js = require('xml2js');
const config = {};

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
const methods = ['get', 'post', 'put', 'delete', 'options', 'all', 'use'];
// 实现路由池
methods.forEach((method) => {
    app[method] = (path, fn) => {
        app.routes.push({method, path, fn});
    }
});

// 使用generator函数实现惰性求值
const lazy = function* (arr) {
    yield* arr;
}

// 遍历路由池
// routes 路由池
// method 命令
// path 请求路径
const passRouter = (routes, method, path) => (req, res) => {
    // 模式匹配
    const replaceParams = (path) => new RegExp(`\^${path.replace(/:\w[^\/]+/g, '\\w[^\/]+')}\$`);
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
        } else if (it.path.includes(':') && (it.method === method || it.method === 'all') && (replaceParams(it.path).test(path))) {
            // 模式匹配
            let index = 0;
            const params2Array = it.path.split('/'); // 注册函数的path
            const path2Array = path.split('/');// 请求路径的path
            const params = {};
            params2Array.forEach((path) => {
                if (/\:/.test(path)) {
                    // 如果是模式匹配的路径 就加入params对象中
                    params[path.slice(1)] = path2Array[index];
                }
                index++
            })
            req.params = params;
            it.fn(req, res);
        } else if (it.method === 'get' && it.path.includes(req.url)) {
            // 若允许访问的目录的子目录未允许访问
            res.writeHead(403, {'content-type': 'text/plain;charset=utf-8'});
            res.end(`暂未有访问权限`);
            return;
        } else {
            // 继续匹配
            next();
        }
    })()
}

// 处理静态文件函数
// res response对象
// pathName 静态文件相对路径
// ext 静态文件后缀
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
                    res.end(err);
                } else {
                    // etag用于检验文件是否有变动
                    const etag = crypto.createHash('md5').update(file).digest('hex'); // md5算法
                    if (res.ifNoneMatch === etag) {
                        res.writeHead(304);
                        res.end()
                    } else {
                        const ContentType = mime[ext] || 'text/plain';
                        res.setHeader('Etag', etag);
                        res.writeHead(200, {'Cotent-Type': ContentType});
                        res.write(file);
                        res.end();
                    }
                }
            })
        }
    })
}

// 目录浏览
// dir 需要提供目录浏览功能的目录
// dirname 本地路径 即__dirname 
// bool 子目录是否提供浏览功能
app.dir = function (_dir, dirname, bool) {
    app.get(_dir, (req, res) => {
        let html = "<head><meta charset='utf-8'></head>";
        try {
            // 用户访问目录
            let files = fs.readdirSync(dirname + _dir);
            let fileName = null;
            for (let i in files) {
                if (path.extname(files[i]) === "" && bool === true) {
                    app.dir(_dir + '/' + files[i], dirname, bool)
                }
                fileName = files[i];
                html += "<div><a  href='" +_dir + '/' + fileName + "'>" + fileName + "</a></div>";
            }
        } catch (e) {
            html += '<h1>您访问的目录不存在</h1>';
        }
        res.writeHead(200, {'content-type': 'text/html'});
        res.end(html);
    })
}

// 启动服务
app.listen = (port, host, callback) => {
    http.createServer((req, res) => {
        // 获取请求的方法
        const method = req.method.toLowerCase()
        // 解析url
        const urlObj = url.parse(req.url, true)
        // 获取path部分
        const pathName = urlObj.pathname
        // 获取后缀
        const ext = path.extname(pathName).slice(1);
        // 若有后缀 则是静态文件
        if (ext) {
            // if-none-match 判断缓存是否可用
            res.ifNoneMatch = req.headers['if-none-match'];
            handleStatic(res, _static + pathName, ext)
        } else {
            // 遍历路由池
            passRouter(app.routes, method, pathName)(req, res)
        }
    }).listen(port, host, ()=>{
        console.log(`server start at http://${host}:${port}`)
    });
};

// 解析web.config
app.resolve = () => {
    let parser = new xml2js.Parser({explicitArray : false});
    fs.readFile('./web.config', (err, file) => {
        parser.parseString(file, (err, result) => {
            for(let i in result.webconfig) {
                config[i] = result.webconfig[i]
            }
            app.doDir();
        })
    })
}

// 目录配置字符串解析并调用dir函数
app.doDir = () => {
    for(let i of config.resolveDir.dir) {
        if (i.indexOf("[") === 0) {
            i = i.substring(1, i.length - 1);
        }
        i = i.split(',');
        app.dir(i[0], __dirname, i[1]);
    }
    app.listen(config.port, config.host);
}

app.use('/blog', (req, res, next) => {
    console.log('%s %s', req.method, req.url);
    next()
})
app.get('/blog/:id', (req, res, next) => {
    res.end('hello ' + req.params.id)
})

app.resolve();

module.exports = app