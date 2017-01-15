# promise-hack
**从停掉Promise chain说起**
在中大型的项目中，我经常会遇到比较长的Promise chain，尤其是API调用的时候，
数据要经过层层的转换和计算，才呈现到页面中，这时候如果API调用出错，
或者数据计算中出现未考虑到错误，代码就会在某段Promise chain中抛出异常，
停止继续运行，甚至阻塞了剩余代码的运行，但是Promise chain并不会停止（
Promise机制决定，可简单理解每段Promise chain都是回调），
由于异常导致当前的chain没有返回值，后续的chain也接受不到预期的data，
异常会发生连锁反应，沿着Promise chain一直传递到末端的页面，
此时页面很有可能就挂了，但这并不是我们想要看到的。

我们的希望是即使代码出现异常也不会影响页面的呈现，或者给出一些恰当的提示（在一些To B的项目中），
那么Promise chain能在异常的时候终止，并且跳到预先写好的错误处理部分就好了。

可能你会觉得这不难啊，使用`catch`就能做到啊。确实是这样的，但我想你忽略了一个很重要的条件，
当我们在做中大型项目时，经常会使用别人丢给我们的接口，这是一个Promise的接口，
如果写上层接口的人，没有很好的handle error，结果某次调用中给出的并不是期望的数据，
那么由你负责的部分产生连锁反应，全部异常了，我想这个锅你是不想背的。

当我们拿到接口的时候不可能也不想先catch一下有没有异常再开始Promise chain吧，
我想要的如果Promise chain运行到我负责的部分数据永远是正常的，如果有异常就不要把数据抛给我，
此时，调用者只需要关心自己的逻辑，处理自己error就ok了。

这同样适用于函数之间的调用，每一个函数模块关心的仅仅是自己的逻辑处理，
并永远只给出正确的结果，因为拿到的数据永远也是正确的。此时，能停止Promise chain就显得尤为重要了。

**逻辑实现**
受到[xieranmaya](https://github.com/xieranmaya/blog/issues/5#issuecomment-271871102)启发，
我写了一些对原生Promise的侵入性比较强的代码，仅做为一个简单的示例

一个停止的信号

```javascript
  // 静态变量 停止信号
  const STOP_SIGNAL = {}
```

一个静态的停止方法 `Promise.stop(data)`

```javascript
  // 实质是返回一下携带停止信号的 Promise.resolve
  Object.defineProperty(Promise, 'stop', {
    writable: false,
    enumerable: false,
    configurable: true,
    value: function(data) {
      return Promise.resolve({
        signal: STOP_SIGNAL,
        value: data,
      });
    }
  })
```

然后以上并不能在`then`中感知到这个停止信号，我们还需要一个能感知停止信号的实例方法 `next(data => {})`,
其实我是想直接hack `then` 的，但是貌似不能work，如果你想到好的解决方案，请联系我，谢谢。

```javascript
// 实质是调用then方法，检测是否包含停止信号，决定是否执行onResolved
  Promise.prototype.next = function(onResolved, onRejected) {
    return this.then(data => {
      if (Array.isArray(data)) {
        // 如果data是数组，说明使用了Promise.all 或 race
        // 目前 对Promise.all Promise.race 不支持whenStop方式，
        // 但如果使用all来调用使用的stop的promise，会出现数据污染
        // 那么对于使用了Promise.stop后需要做解包处理
        // 去掉里面的signal字段
        // 另外，如果使用all调用含stop的promise则必须使用next解包，
        // 使用then会有数据污染
        // 污染后的数据格式为data:{single,value}，其中value是真实的值
        return onResolved(data.map(item => {
          if ('signal' in item) {
            return item.value
          }
          return item
        }))
      }
      if (data && data.signal && data.signal === STOP_SIGNAL) {
        return data;
      } else {
        return onResolved(data);
      }
    }, onRejected);
  }
```

我想我们已经基本完成了想要的功能，等一下我用了**我想**，说明并没有，
我们确实做到了停止Promise chain。但Promise chain停止以后就意味着所有挂接在Promise chain
的代码都不会被执行到，然而，我们有时会想在异常出现后清除一些页面的状态，如`loading`，
或者我想handle error,并给出一些恰当提示。

所以需要一个感知停止信号，并处理停止信号的函数`whenStop(data => {})`

```javascript
  // 实质是调用then方法，检测是否包含停止信号，决定是否执行onResolved
  Promise.prototype.whenStop = function(onResolved, onRejected) {
    return this.then(data => {
      if (data && data.signal && data.signal === STOP_SIGNAL) {
        return onResolved(data.value);
      } else {
        return data;
      }
    }, onRejected);
  }
```

以上我们就完成了所有想要的功能的hack
