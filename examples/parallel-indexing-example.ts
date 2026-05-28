/**
 * 并行索引示例
 * 
 * 展示如何使用优化后的索引服务进行高性能文件索引
 */

import { CodeIndexService } from '../src/service/indexer';
import { ProjectScanner } from '../src/scanner';
import { JavaExtractor, PythonExtractor, TypeScriptExtractor } from '../src/parser';
import { SimpleResolver } from '../src/resolver';
import { SqliteGraphStore } from '../src/store/queries';
import os from 'os';

async function main() {
  // 1. 初始化组件
  const dbPath = ':memory:'; // 使用内存数据库进行演示
  const store = new SqliteGraphStore(dbPath);
  store.init();

  const scanner = new ProjectScanner();
  const parsers = [
    new TypeScriptExtractor(),
    new JavaExtractor(),
    new PythonExtractor(),
  ];
  const resolver = new SimpleResolver(store);

  const indexService = new CodeIndexService(scanner, parsers, resolver, store);

  // 2. 基本用法 - 使用默认并发数（10）
  console.log('示例 1: 基本并行索引');
  const projectRoot = process.cwd();
  
  await indexService.indexAll(projectRoot);
  console.log('✓ 索引完成\n');

  // 3. 自定义并发数 - 根据 CPU 核心数
  console.log('示例 2: 自定义并发数');
  const cpuCount = os.cpus().length;
  console.log(`检测到 ${cpuCount} 个 CPU 核心`);
  
  await indexService.indexAll(projectRoot, {
    concurrency: Math.max(1, cpuCount - 1), // 保留一个核心给系统
  });
  console.log('✓ 索引完成\n');

  // 4. 带进度报告的索引
  console.log('示例 3: 带进度报告的索引');
  const startTime = Date.now();
  let lastUpdate = startTime;
  
  await indexService.indexAll(projectRoot, {
    concurrency: 10,
    onProgress: (current, total, file) => {
      const now = Date.now();
      // 每 100ms 更新一次，避免输出过多
      if (now - lastUpdate > 100 || current === total) {
        const percent = ((current / total) * 100).toFixed(1);
        const elapsed = (now - startTime) / 1000;
        const rate = current / elapsed;
        const remaining = (total - current) / rate;
        
        process.stdout.write(
          `\r进度: ${percent}% (${current}/${total}) | ` +
          `速度: ${rate.toFixed(1)} 文件/秒 | ` +
          `预计剩余: ${remaining.toFixed(0)}秒 | ` +
          `当前: ${file?.substring(0, 40) || ''}...`
        );
        
        lastUpdate = now;
      }
      
      if (current === total) {
        console.log('\n✓ 索引完成');
      }
    },
  });
  
  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`总耗时: ${totalTime.toFixed(2)} 秒\n`);

  // 5. 增量同步示例
  console.log('示例 4: 增量同步');
  const syncResult = await indexService.sync(projectRoot, {
    concurrency: 10,
    onProgress: (current, total, file) => {
      console.log(`[${current}/${total}] 同步: ${file}`);
    },
  });
  
  console.log('同步结果:');
  console.log(`  新增: ${syncResult.added} 个文件`);
  console.log(`  修改: ${syncResult.modified} 个文件`);
  console.log(`  删除: ${syncResult.deleted} 个文件`);
  console.log(`  总变更: ${syncResult.changedFiles} 个文件`);
  console.log('✓ 同步完成\n');

  // 6. 带差异分析的同步
  console.log('示例 5: 带差异分析的同步');
  const diffResult = await indexService.sync(projectRoot, {
    diff: true,
    concurrency: 10,
  });
  
  if (diffResult.diff) {
    console.log('代码图变更:');
    console.log(`  新增节点: ${diffResult.diff.nodes.added.length}`);
    console.log(`  删除节点: ${diffResult.diff.nodes.removed.length}`);
    console.log(`  更新节点: ${diffResult.diff.nodes.updated.length}`);
    console.log(`  新增边: ${diffResult.diff.edges.added.length}`);
    console.log(`  删除边: ${diffResult.diff.edges.removed.length}`);
  }
  console.log('✓ 差异分析完成\n');

  // 7. 性能监控示例
  console.log('示例 6: 性能监控');
  const perfStart = Date.now();
  let processedFiles = 0;
  const fileTimes: number[] = [];
  
  await indexService.indexAll(projectRoot, {
    concurrency: 10,
    onProgress: (current, total, file) => {
      const fileTime = Date.now() - perfStart;
      if (current > processedFiles) {
        fileTimes.push(fileTime);
        processedFiles = current;
      }
    },
  });
  
  const perfEnd = Date.now();
  const totalDuration = (perfEnd - perfStart) / 1000;
  const avgFileTime = fileTimes.reduce((a, b) => a + b, 0) / fileTimes.length;
  
  console.log('性能统计:');
  console.log(`  总耗时: ${totalDuration.toFixed(2)} 秒`);
  console.log(`  处理文件数: ${processedFiles}`);
  console.log(`  平均速度: ${(processedFiles / totalDuration).toFixed(1)} 文件/秒`);
  console.log(`  平均文件处理时间: ${avgFileTime.toFixed(2)} 毫秒`);
  console.log('✓ 性能监控完成\n');

  // 清理
  store.close();
}

// 运行示例
if (require.main === module) {
  main().catch(console.error);
}

export { main };
