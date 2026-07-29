# FusionPRIME 的 Kernel 设计框架

Kernel 是 FusionPRIME 的核心计算单元, 负责将物理问题的数学模型转化为可执行的数值计算过程. Kernel 的设计目标是高性能、简单控制逻辑. 其输入输出类型均为 frozen、slots dataclass, 且内部不存在自定义类型.

Kernel 与外部设计的交互:

1. Module 通过 Adapter 将 State 整理为 Kernel 的输入
2. Kernel 执行 setup, runtime 和 evaluate 的具体计算, 返回 Result
3. Module 保存当前 Result, 并记录到 Workflow 中

接下来给定一些基本 contract, 不同的 Kernel 中这些语义都是一致的.

## 接口

```python
kernel = build(topology)
result = kernel.solve(instance, config)
```

- **build**: 根据拓扑结构构建 Kernel 实例, 主要是根据拓扑结构的不同选择不同的 Kernel 实现族.
- **solve**: 使用构建好的 Kernel 实例来求解具体的问题.

## 计算语义

- **setup**: 处理固定拓扑, 数组规模, 索引, 静态结构, backend 构建及 workspace 分配等通常不变的准备工作
- **runtime**: 绑定本次物理输入和初值, 控制迭代过程, 内部包含多次 evaluate, 检查结果并返回新 Result
- **evaluate**: 核心数值热路径, 只操作已经准备好的数组和 workspace, 避免临时分配与重复计算

## 交互数据集合

Kernel 在设计上存在几类数据集合(frozen、slots dataclass):

- **Topology**: 拓扑结构,决定编译产物、静态内存布局、运行时 ABI、残差维数和静态分支的全部属性
- **Instance**: 一次具体 solve 调用所使用的全部数据，包括物理输入和初始状态(包括猜测解)
- **Config**: 不属于物理问题、并且通过 runtime ABI 控制具体求解过程的配置
- **Result**: 求解输出的全部报告，以及建立对应 State 所需的全部物理信息

## 高性能后端

Kernel 都应该提供 Python/C++ 双后端:

- **Numba:** 编译快速, 面向普通 Python 用户, 也作为严格浮点语义下的参考实现;
- **C++:** 面向固定拓扑和极限性能优化, 可以使用 `fastmath` 和 relaxed floating-point 规则.

两种后端共享相同的 `setup / runtime / evaluate` 语义和结果接口.
